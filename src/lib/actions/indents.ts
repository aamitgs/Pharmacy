"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma, runInTenantTransaction } from "@/lib/prisma";
import { requireHospitalTenant, assertWardAccess, resolveNurseWardIds } from "@/lib/hospital-scope";
import { writeAuditLog } from "@/lib/audit";

const APPROVAL_ROLES = ["owner", "pharmacist", "ward_pharmacist"] as const;

/** Wards the current user may act on — every ward for central-pharmacy
 * roles, only assigned wards for a Ward Nurse. Powers both the ward picker
 * on the create-indent form and the queue filter below. */
export async function getIndentFormData() {
  const { session, tenant } = await requireHospitalTenant();
  const nurseWardIds =
    session.user.role === "ward_nurse" ? await resolveNurseWardIds(tenant.id, session.user.id) : null;

  const [wards, items] = await Promise.all([
    prisma.ward.findMany({
      where: { tenantId: tenant.id, ...(nurseWardIds ? { id: { in: nurseWardIds } } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, branchId: true },
    }),
    prisma.item.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true } }),
  ]);

  return { wards, items, isApprover: (APPROVAL_ROLES as readonly string[]).includes(session.user.role) };
}

/** Central-pharmacy queue (all wards) for approver roles; a Ward Nurse only
 * sees indents for wards they're assigned to — server-side, not just a
 * hidden filter, since assertWardAccess-style scoping matters here too. */
export async function listIndents() {
  const { session, tenant } = await requireHospitalTenant();
  const nurseWardIds =
    session.user.role === "ward_nurse" ? await resolveNurseWardIds(tenant.id, session.user.id) : null;

  const indents = await prisma.indent.findMany({
    where: { tenantId: tenant.id, ...(nurseWardIds ? { wardId: { in: nurseWardIds } } : {}) },
    include: {
      ward: { select: { name: true } },
      requestedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      items: { include: { item: { select: { name: true, unit: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return indents.map((i) => ({
    id: i.id,
    wardId: i.wardId,
    wardName: i.ward.name,
    status: i.status,
    createdAt: i.createdAt,
    requestedByName: i.requestedBy.name,
    approvedByName: i.approvedBy?.name ?? null,
    items: i.items.map((line) => ({
      itemName: line.item.name,
      unit: line.item.unit,
      qtyRequested: line.qtyRequested,
      qtyIssued: line.qtyIssued,
    })),
  }));
}

const createIndentSchema = z.object({
  wardId: z.string().min(1, "Select a ward"),
  items: z.array(z.object({ itemId: z.string().min(1), qtyRequested: z.coerce.number().int().positive() })).min(1, "Add at least one item"),
});

export type CreateIndentInput = z.infer<typeof createIndentSchema>;

export async function createIndent(input: CreateIndentInput) {
  const { session, tenant } = await requireHospitalTenant();
  const parsed = createIndentSchema.parse(input);
  await assertWardAccess(session, parsed.wardId);

  const ward = await prisma.ward.findFirst({ where: { id: parsed.wardId, tenantId: tenant.id } });
  if (!ward) throw new Error("Ward not found");

  const indent = await prisma.indent.create({
    data: {
      tenantId: tenant.id,
      wardId: parsed.wardId,
      requestedByUserId: session.user.id,
      items: { create: parsed.items.map((i) => ({ itemId: i.itemId, qtyRequested: i.qtyRequested })) },
    },
  });

  await writeAuditLog({
    tenantId: tenant.id,
    userId: session.user.id,
    action: "indent.request",
    entity: "Indent",
    entityId: indent.id,
    after: { wardId: parsed.wardId, itemCount: parsed.items.length },
  });

  revalidatePath("/indents");
  return { id: indent.id };
}

/** Approval-screen detail — includes central (wardId: null) stock at the
 * requesting ward's branch, FEFO-ordered, so the pharmacist sees the same
 * earliest-expiry-first suggestion the retail POS surfaces, with room to
 * pick a different batch instead (the "override" the design calls for). */
export async function getIndentDetail(indentId: string) {
  const { session, tenant } = await requireHospitalTenant();

  const indent = await prisma.indent.findFirst({
    where: { id: indentId, tenantId: tenant.id },
    include: {
      ward: { select: { id: true, name: true, branchId: true } },
      requestedBy: { select: { name: true } },
      items: { include: { item: { select: { id: true, name: true, unit: true } }, batch: { select: { batchNo: true } } } },
    },
  });
  if (!indent) throw new Error("Indent not found");
  await assertWardAccess(session, indent.wardId);

  const itemIds = indent.items.map((i) => i.itemId);
  const centralBatches = await prisma.batch.findMany({
    where: { itemId: { in: itemIds }, branchId: indent.ward.branchId, wardId: null, currentQty: { gt: 0 } },
    orderBy: { expiryDate: "asc" },
  });
  const batchesByItem = new Map<string, typeof centralBatches>();
  for (const b of centralBatches) {
    const list = batchesByItem.get(b.itemId) ?? [];
    list.push(b);
    batchesByItem.set(b.itemId, list);
  }

  return {
    id: indent.id,
    status: indent.status,
    wardId: indent.ward.id,
    wardName: indent.ward.name,
    requestedByName: indent.requestedBy.name,
    createdAt: indent.createdAt,
    items: indent.items.map((line) => ({
      id: line.id,
      itemId: line.itemId,
      itemName: line.item.name,
      unit: line.item.unit,
      qtyRequested: line.qtyRequested,
      qtyIssued: line.qtyIssued,
      issuedBatchNo: line.batch?.batchNo ?? null,
      availableBatches: (batchesByItem.get(line.itemId) ?? []).map((b) => ({
        id: b.id,
        batchNo: b.batchNo,
        expiryDate: b.expiryDate,
        currentQty: b.currentQty,
      })),
    })),
  };
}

const decisionSchema = z.object({
  indentItemId: z.string().min(1),
  qtyIssued: z.coerce.number().int().min(0),
  batchId: z.string().optional(),
});

const issueIndentSchema = z.object({
  indentId: z.string().min(1),
  decisions: z.array(decisionSchema),
});

export type IssueIndentInput = z.infer<typeof issueIndentSchema>;

/**
 * Fully/partially issues an indent in one decisive action — no multi-round
 * re-issuing, matching approveStockTransfer's single-decision pattern this
 * is modeled on (issuing twice against the same line would double-move
 * stock, since qtyIssued is set absolutely, not incremented). A ward that
 * needs more after a partial issue submits a new Indent. A line with
 * qtyIssued 0 is simply not fulfilled; status becomes "issued" if every
 * line got its full qtyRequested, "partially_issued" otherwise.
 */
export async function issueIndent(input: IssueIndentInput) {
  const { session, tenant } = await requireHospitalTenant([...APPROVAL_ROLES]);
  const parsed = issueIndentSchema.parse(input);
  const tenantId = tenant.id;

  const indent = await prisma.indent.findFirst({
    where: { id: parsed.indentId, tenantId },
    include: { ward: true, items: true },
  });
  if (!indent) throw new Error("Indent not found");
  if (indent.status !== "pending") {
    throw new Error("This indent has already been decided.");
  }

  const itemMap = new Map(indent.items.map((i) => [i.id, i]));
  const activeDecisions = parsed.decisions.filter((d) => d.qtyIssued > 0);
  if (activeDecisions.length === 0) {
    throw new Error("Set at least one quantity to issue, or reject the indent instead.");
  }
  for (const d of activeDecisions) {
    const line = itemMap.get(d.indentItemId);
    if (!line || line.indentId !== indent.id) throw new Error("Indent line not found.");
    if (!d.batchId) throw new Error(`Select a batch for ${d.indentItemId}.`);
    if (d.qtyIssued > line.qtyRequested) throw new Error("Cannot issue more than requested.");
  }

  await runInTenantTransaction(async (tx) => {
    for (const d of activeDecisions) {
      const line = itemMap.get(d.indentItemId)!;

      const sourceBatch = await tx.batch.findFirst({
        where: { id: d.batchId, branchId: indent.ward.branchId, wardId: null, itemId: line.itemId },
      });
      if (!sourceBatch || sourceBatch.currentQty < d.qtyIssued) {
        throw new Error("Not enough central stock left for one of the selected batches — refresh and try again.");
      }

      const decremented = await tx.batch.updateMany({
        where: { id: sourceBatch.id, currentQty: { gte: d.qtyIssued } },
        data: { currentQty: { decrement: d.qtyIssued } },
      });
      if (decremented.count === 0) {
        throw new Error("Central stock changed — please review and try again.");
      }

      const destBatch = await tx.batch.findFirst({
        where: { branchId: indent.ward.branchId, wardId: indent.ward.id, itemId: sourceBatch.itemId, batchNo: sourceBatch.batchNo },
      });
      if (destBatch) {
        await tx.batch.update({ where: { id: destBatch.id }, data: { currentQty: { increment: d.qtyIssued } } });
      } else {
        await tx.batch.create({
          data: {
            itemId: sourceBatch.itemId,
            branchId: indent.ward.branchId,
            wardId: indent.ward.id,
            batchNo: sourceBatch.batchNo,
            mfgDate: sourceBatch.mfgDate,
            expiryDate: sourceBatch.expiryDate,
            mrp: sourceBatch.mrp,
            purchaseRate: sourceBatch.purchaseRate,
            saleRate: sourceBatch.saleRate,
            currentQty: d.qtyIssued,
          },
        });
      }

      await tx.indentItem.update({
        where: { id: line.id },
        data: { qtyIssued: d.qtyIssued, batchId: sourceBatch.id },
      });
    }

    const finalQtyById = new Map(indent.items.map((i) => [i.id, i.qtyIssued]));
    for (const d of activeDecisions) finalQtyById.set(d.indentItemId, d.qtyIssued);
    const allFull = indent.items.every((i) => finalQtyById.get(i.id) === i.qtyRequested);

    await tx.indent.update({
      where: { id: indent.id },
      data: {
        status: allFull ? "issued" : "partially_issued",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
      },
    });
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "indent.issue",
    entity: "Indent",
    entityId: indent.id,
    after: { decisions: activeDecisions },
  });

  revalidatePath("/indents");
  revalidatePath("/items");
  revalidatePath("/dashboard");
}

export async function rejectIndent(indentId: string) {
  const { session, tenant } = await requireHospitalTenant([...APPROVAL_ROLES]);
  const indent = await prisma.indent.findFirst({ where: { id: indentId, tenantId: tenant.id } });
  if (!indent) throw new Error("Indent not found");
  if (indent.status !== "pending") throw new Error("This indent has already been decided.");

  await prisma.indent.update({
    where: { id: indent.id },
    data: { status: "rejected", approvedByUserId: session.user.id, approvedAt: new Date() },
  });

  await writeAuditLog({
    tenantId: tenant.id,
    userId: session.user.id,
    action: "indent.reject",
    entity: "Indent",
    entityId: indent.id,
    before: { status: "pending" },
    after: { status: "rejected" },
  });

  revalidatePath("/indents");
}
