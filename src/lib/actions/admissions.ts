"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma, runInTenantTransaction } from "@/lib/prisma";
import { requireHospitalTenant, assertWardAccess, resolveNurseWardIds } from "@/lib/hospital-scope";
import { writeAuditLog } from "@/lib/audit";

/** Ward-scoped for a Ward Nurse (their assigned ward(s) only), unrestricted
 * for owner/pharmacist/ward_pharmacist — same scoping rule as listIndents. */
export async function listAdmissions() {
  const { session, tenant } = await requireHospitalTenant();
  const nurseWardIds =
    session.user.role === "ward_nurse" ? await resolveNurseWardIds(tenant.id, session.user.id) : null;

  const admissions = await prisma.patientAdmission.findMany({
    where: { tenantId: tenant.id, ...(nurseWardIds ? { wardId: { in: nurseWardIds } } : {}) },
    include: { ward: { select: { name: true } } },
    orderBy: { admittedAt: "desc" },
  });

  return admissions.map((a) => ({
    id: a.id,
    admissionRef: a.admissionRef,
    patientName: a.patientName,
    wardId: a.wardId,
    wardName: a.ward.name,
    admittedAt: a.admittedAt,
    dischargedAt: a.dischargedAt,
  }));
}

/** Wards the current user may admit a patient into — same scoping as the indent form. */
export async function getAdmissionFormWards() {
  const { session, tenant } = await requireHospitalTenant();
  const nurseWardIds =
    session.user.role === "ward_nurse" ? await resolveNurseWardIds(tenant.id, session.user.id) : null;
  return prisma.ward.findMany({
    where: { tenantId: tenant.id, ...(nurseWardIds ? { id: { in: nurseWardIds } } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

const createAdmissionSchema = z.object({
  admissionRef: z.string().trim().min(1, "Admission reference is required"),
  patientName: z.string().trim().min(1, "Patient name is required"),
  wardId: z.string().min(1, "Select a ward"),
});

export type CreateAdmissionInput = z.infer<typeof createAdmissionSchema>;

export async function createAdmission(input: CreateAdmissionInput) {
  const { session, tenant } = await requireHospitalTenant();
  const parsed = createAdmissionSchema.parse(input);
  await assertWardAccess(session, parsed.wardId);

  const ward = await prisma.ward.findFirst({ where: { id: parsed.wardId, tenantId: tenant.id } });
  if (!ward) throw new Error("Ward not found");

  const existing = await prisma.patientAdmission.findFirst({
    where: { tenantId: tenant.id, admissionRef: parsed.admissionRef },
  });
  if (existing) throw new Error("An admission with this reference already exists.");

  const admission = await prisma.patientAdmission.create({
    data: { tenantId: tenant.id, admissionRef: parsed.admissionRef, patientName: parsed.patientName, wardId: parsed.wardId },
  });

  await writeAuditLog({
    tenantId: tenant.id,
    userId: session.user.id,
    action: "admission.create",
    entity: "PatientAdmission",
    entityId: admission.id,
    after: { admissionRef: admission.admissionRef, wardId: admission.wardId },
  });

  revalidatePath("/admissions");
  return { id: admission.id };
}

export async function dischargeAdmission(admissionId: string) {
  const { session, tenant } = await requireHospitalTenant();
  const admission = await prisma.patientAdmission.findFirst({ where: { id: admissionId, tenantId: tenant.id } });
  if (!admission) throw new Error("Admission not found");
  await assertWardAccess(session, admission.wardId);
  if (admission.dischargedAt) throw new Error("Already discharged.");

  await prisma.patientAdmission.update({ where: { id: admission.id }, data: { dischargedAt: new Date() } });

  await writeAuditLog({
    tenantId: tenant.id,
    userId: session.user.id,
    action: "admission.discharge",
    entity: "PatientAdmission",
    entityId: admission.id,
    after: { dischargedAt: new Date() },
  });

  revalidatePath("/admissions");
}

/** The combined dispense + return screen's data: admission details, the
 * ward's own available stock (FEFO-ordered) for the item picker, and the
 * dispense history each row of which is what the return flow selects from. */
export async function getAdmissionDetail(admissionId: string) {
  const { session, tenant } = await requireHospitalTenant();

  const admission = await prisma.patientAdmission.findFirst({
    where: { id: admissionId, tenantId: tenant.id },
    include: { ward: { select: { id: true, name: true } } },
  });
  if (!admission) throw new Error("Admission not found");
  await assertWardAccess(session, admission.wardId);

  const [wardBatches, dispenses] = await Promise.all([
    prisma.batch.findMany({
      where: { wardId: admission.wardId, currentQty: { gt: 0 } },
      include: { item: { select: { id: true, name: true, unit: true, scheduleClass: true } } },
      orderBy: { expiryDate: "asc" },
    }),
    prisma.ipdDispense.findMany({
      where: { admissionId: admission.id },
      include: { item: { select: { name: true, unit: true } }, batch: { select: { batchNo: true } }, dispensedBy: { select: { name: true } } },
      orderBy: { dispensedAt: "desc" },
    }),
  ]);

  return {
    id: admission.id,
    admissionRef: admission.admissionRef,
    patientName: admission.patientName,
    wardId: admission.ward.id,
    wardName: admission.ward.name,
    dischargedAt: admission.dischargedAt,
    availableBatches: wardBatches.map((b) => ({
      id: b.id,
      itemId: b.itemId,
      itemName: b.item.name,
      unit: b.item.unit,
      scheduleClass: b.item.scheduleClass,
      batchNo: b.batchNo,
      expiryDate: b.expiryDate,
      currentQty: b.currentQty,
    })),
    dispenses: dispenses.map((d) => ({
      id: d.id,
      itemName: d.item.name,
      unit: d.item.unit,
      batchNo: d.batch.batchNo,
      qty: d.qty,
      returnedQty: d.returnedQty,
      dispensedByName: d.dispensedBy.name,
      dispensedAt: d.dispensedAt,
    })),
  };
}

const dispenseSchema = z.object({
  admissionId: z.string().min(1),
  batchId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
});

export type DispenseInput = z.infer<typeof dispenseSchema>;

export async function dispenseToAdmission(input: DispenseInput) {
  const { session, tenant } = await requireHospitalTenant();
  const parsed = dispenseSchema.parse(input);

  const admission = await prisma.patientAdmission.findFirst({ where: { id: parsed.admissionId, tenantId: tenant.id } });
  if (!admission) throw new Error("Admission not found");
  await assertWardAccess(session, admission.wardId);
  if (admission.dischargedAt) throw new Error("This patient has already been discharged.");

  const batch = await prisma.batch.findFirst({ where: { id: parsed.batchId, wardId: admission.wardId } });
  if (!batch) throw new Error("Batch not found in this ward's stock.");
  if (batch.currentQty < parsed.qty) throw new Error(`Only ${batch.currentQty} unit(s) left in ward stock.`);

  const dispense = await runInTenantTransaction(async (tx) => {
    const decremented = await tx.batch.updateMany({
      where: { id: batch.id, currentQty: { gte: parsed.qty } },
      data: { currentQty: { decrement: parsed.qty } },
    });
    if (decremented.count === 0) throw new Error("Ward stock changed — please review and try again.");

    return tx.ipdDispense.create({
      data: {
        tenantId: tenant.id,
        admissionId: admission.id,
        itemId: batch.itemId,
        batchId: batch.id,
        qty: parsed.qty,
        dispensedByUserId: session.user.id,
      },
    });
  });

  await writeAuditLog({
    tenantId: tenant.id,
    userId: session.user.id,
    action: "ipd_dispense.create",
    entity: "IpdDispense",
    entityId: dispense.id,
    after: { admissionId: admission.id, itemId: batch.itemId, qty: parsed.qty },
  });

  revalidatePath(`/admissions/${admission.id}`);
  return { id: dispense.id };
}

const returnSchema = z.object({
  dispenseId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
});

export type ReturnDispenseInput = z.infer<typeof returnSchema>;

export async function returnDispense(input: ReturnDispenseInput) {
  const { session, tenant } = await requireHospitalTenant();
  const parsed = returnSchema.parse(input);

  const dispense = await prisma.ipdDispense.findFirst({
    where: { id: parsed.dispenseId, tenantId: tenant.id },
    include: { admission: true },
  });
  if (!dispense) throw new Error("Dispense record not found");
  await assertWardAccess(session, dispense.admission.wardId);

  const remainder = dispense.qty - dispense.returnedQty;
  if (parsed.qty > remainder) throw new Error(`Only ${remainder} unit(s) can still be returned.`);

  await runInTenantTransaction(async (tx) => {
    await tx.ipdDispense.update({
      where: { id: dispense.id },
      data: { returnedQty: { increment: parsed.qty } },
    });
    await tx.batch.update({
      where: { id: dispense.batchId },
      data: { currentQty: { increment: parsed.qty } },
    });
  });

  await writeAuditLog({
    tenantId: tenant.id,
    userId: session.user.id,
    action: "ipd_dispense.return",
    entity: "IpdDispense",
    entityId: dispense.id,
    after: { returnedQty: dispense.returnedQty + parsed.qty },
  });

  revalidatePath(`/admissions/${dispense.admissionId}`);
}
