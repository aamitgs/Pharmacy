"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireRetailSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

const rateContractSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  itemId: z.string().min(1, "Item is required"),
  contractRate: z.coerce.number().positive("Contract rate must be greater than zero"),
  validFrom: z.string().min(1),
  validTo: z.string().min(1),
  active: z.boolean().default(true),
});

export type RateContractInput = z.infer<typeof rateContractSchema>;

function serializeRateContract(rc: {
  id: string;
  customerId: string;
  customer: { name: string };
  itemId: string;
  item: { name: string };
  contractRate: unknown;
  validFrom: Date;
  validTo: Date;
  active: boolean;
}) {
  return {
    id: rc.id,
    customerId: rc.customerId,
    customerName: rc.customer.name,
    itemId: rc.itemId,
    itemName: rc.item.name,
    contractRate: Number(rc.contractRate),
    validFrom: rc.validFrom.toISOString(),
    validTo: rc.validTo.toISOString(),
    active: rc.active,
  };
}

/** Lightweight pickers for the create/edit form. */
export async function getRateContractFormData() {
  const session = await requireRole(["owner", "pharmacist"]);
  const [customers, items] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId: session.user.tenantId },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    prisma.item.findMany({
      where: { tenantId: session.user.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { customers, items };
}

export async function listRateContracts() {
  const session = await requireRole(["owner", "pharmacist"]);
  const rows = await prisma.rateContract.findMany({
    where: { tenantId: session.user.tenantId },
    include: { customer: { select: { name: true } }, item: { select: { name: true } } },
    orderBy: { validFrom: "desc" },
  });
  return rows.map(serializeRateContract);
}

/**
 * Active, in-date contracts for one customer only — what the POS billing
 * screen looks up when a customer is selected, to auto-apply a negotiated
 * rate in place of the batch's normal saleRate. Same "active in-date rows
 * for billing" shape as listActiveSchemesForBilling in schemes.ts, scoped
 * further to a single customer since a contract only ever applies to the
 * customer it was negotiated with.
 */
export async function listActiveRateContractsForCustomer(
  customerId: string
): Promise<{ itemId: string; contractRate: number }[]> {
  const session = await requireRetailSession();
  const now = new Date();
  const rows = await prisma.rateContract.findMany({
    where: {
      tenantId: session.user.tenantId,
      customerId,
      active: true,
      validFrom: { lte: now },
      validTo: { gte: now },
    },
    select: { itemId: true, contractRate: true },
  });
  return rows.map((r) => ({ itemId: r.itemId, contractRate: Number(r.contractRate) }));
}

export async function createRateContract(input: RateContractInput) {
  const session = await requireRole(["owner"]);
  const parsed = rateContractSchema.parse(input);

  const [customer, item] = await Promise.all([
    prisma.customer.findFirst({ where: { id: parsed.customerId, tenantId: session.user.tenantId } }),
    prisma.item.findFirst({ where: { id: parsed.itemId, tenantId: session.user.tenantId } }),
  ]);
  if (!customer) throw new Error("Customer not found");
  if (!item) throw new Error("Item not found");

  const contract = await prisma.rateContract.create({
    data: {
      tenantId: session.user.tenantId,
      customerId: parsed.customerId,
      itemId: parsed.itemId,
      contractRate: parsed.contractRate,
      validFrom: new Date(parsed.validFrom),
      validTo: new Date(parsed.validTo),
      active: parsed.active,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "rate_contract.create",
    entity: "RateContract",
    entityId: contract.id,
    after: { customerId: parsed.customerId, itemId: parsed.itemId, contractRate: parsed.contractRate },
  });

  revalidatePath("/rate-contracts");
  return { id: contract.id };
}

export async function updateRateContract(contractId: string, input: RateContractInput) {
  const session = await requireRole(["owner"]);
  const parsed = rateContractSchema.parse(input);

  const contract = await prisma.rateContract.findFirst({
    where: { id: contractId, tenantId: session.user.tenantId },
  });
  if (!contract) throw new Error("Rate contract not found");

  await prisma.rateContract.update({
    where: { id: contract.id },
    data: {
      customerId: parsed.customerId,
      itemId: parsed.itemId,
      contractRate: parsed.contractRate,
      validFrom: new Date(parsed.validFrom),
      validTo: new Date(parsed.validTo),
      active: parsed.active,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "rate_contract.update",
    entity: "RateContract",
    entityId: contract.id,
    after: { customerId: parsed.customerId, itemId: parsed.itemId, contractRate: parsed.contractRate, active: parsed.active },
  });

  revalidatePath("/rate-contracts");
}

export async function getRateContract(contractId: string) {
  const session = await requireRole(["owner", "pharmacist"]);
  const contract = await prisma.rateContract.findFirst({
    where: { id: contractId, tenantId: session.user.tenantId },
    include: { customer: { select: { name: true } }, item: { select: { name: true } } },
  });
  return contract ? serializeRateContract(contract) : null;
}

export async function setRateContractActive(contractId: string, active: boolean) {
  const session = await requireRole(["owner"]);
  const contract = await prisma.rateContract.findFirst({
    where: { id: contractId, tenantId: session.user.tenantId },
  });
  if (!contract) throw new Error("Rate contract not found");

  await prisma.rateContract.update({ where: { id: contract.id }, data: { active } });
  revalidatePath("/rate-contracts");
}
