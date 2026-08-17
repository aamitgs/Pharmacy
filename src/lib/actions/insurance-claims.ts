"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { getBranchFilter } from "@/lib/branch-scope";

export async function listInsuranceClaims(status?: "pending" | "approved" | "rejected" | "settled") {
  const session = await requireRole(["owner", "pharmacist"]);
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);

  const claims = await prisma.insuranceClaim.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(status ? { status } : {}),
      invoice: { ...branchFilter },
    },
    include: {
      insuranceProvider: { select: { name: true } },
      invoice: { select: { invoiceNo: true, invoiceDate: true, total: true, customer: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return claims.map((c) => ({
    id: c.id,
    invoiceId: c.invoiceId,
    invoiceNo: c.invoice.invoiceNo,
    invoiceDate: c.invoice.invoiceDate,
    customerName: c.invoice.customer?.name ?? null,
    providerName: c.insuranceProvider.name,
    claimNumber: c.claimNumber,
    claimedAmount: Number(c.claimedAmount),
    coPayAmount: Number(c.coPayAmount),
    status: c.status,
    settledAmount: c.settledAmount ? Number(c.settledAmount) : null,
    settledAt: c.settledAt,
  }));
}

export async function getInsuranceClaim(id: string) {
  const session = await requireRole(["owner", "pharmacist"]);
  const claim = await prisma.insuranceClaim.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      insuranceProvider: true,
      invoice: {
        include: {
          customer: { select: { name: true, phone: true } },
          branch: { select: { name: true } },
          items: { include: { item: { select: { name: true, unit: true } } } },
        },
      },
    },
  });
  if (!claim) return null;

  return {
    id: claim.id,
    claimNumber: claim.claimNumber,
    claimedAmount: Number(claim.claimedAmount),
    coPayAmount: Number(claim.coPayAmount),
    status: claim.status,
    settledAmount: claim.settledAmount ? Number(claim.settledAmount) : null,
    settledAt: claim.settledAt,
    rejectionReason: claim.rejectionReason,
    notes: claim.notes,
    createdAt: claim.createdAt,
    provider: { id: claim.insuranceProvider.id, name: claim.insuranceProvider.name, tpaCode: claim.insuranceProvider.tpaCode },
    invoice: {
      id: claim.invoice.id,
      invoiceNo: claim.invoice.invoiceNo,
      invoiceDate: claim.invoice.invoiceDate,
      total: Number(claim.invoice.total),
      branchName: claim.invoice.branch.name,
      customerName: claim.invoice.customer?.name ?? null,
      customerPhone: claim.invoice.customer?.phone ?? null,
      items: claim.invoice.items.map((i) => ({ itemName: i.item.name, unit: i.item.unit, qty: i.qty, rate: Number(i.rate) })),
    },
  };
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["approved", "rejected"],
  approved: ["settled", "rejected"],
  rejected: ["pending"],
  settled: [],
};

const updateStatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "settled"]),
  settledAmount: z.coerce.number().min(0).optional(),
  rejectionReason: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type UpdateInsuranceClaimStatusInput = z.infer<typeof updateStatusSchema>;

export async function updateInsuranceClaimStatus(id: string, input: UpdateInsuranceClaimStatusInput) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = updateStatusSchema.parse(input);

  const claim = await prisma.insuranceClaim.findFirst({ where: { id, tenantId: session.user.tenantId } });
  if (!claim) throw new Error("Claim not found");

  const allowed = VALID_TRANSITIONS[claim.status] ?? [];
  if (!allowed.includes(parsed.status)) {
    throw new Error(`Cannot move a ${claim.status} claim to ${parsed.status}.`);
  }
  if (parsed.status === "settled" && parsed.settledAmount === undefined) {
    throw new Error("Enter the amount actually settled by the insurer.");
  }
  if (parsed.status === "rejected" && !parsed.rejectionReason) {
    throw new Error("Enter a reason for rejecting this claim.");
  }

  const updated = await prisma.insuranceClaim.update({
    where: { id },
    data: {
      status: parsed.status,
      settledAmount: parsed.status === "settled" ? parsed.settledAmount : claim.settledAmount,
      settledAt: parsed.status === "settled" ? new Date() : claim.settledAt,
      rejectionReason: parsed.status === "rejected" ? parsed.rejectionReason : claim.rejectionReason,
      notes: parsed.notes ?? claim.notes,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "insurance_claim.status_update",
    entity: "InsuranceClaim",
    entityId: id,
    before: { status: claim.status },
    after: { status: updated.status, settledAmount: parsed.settledAmount },
  });

  revalidatePath("/insurance-claims");
  revalidatePath(`/insurance-claims/${id}`);
  return { status: updated.status };
}
