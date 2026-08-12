"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { computeBilling, effectiveDiscountPercent, type BillingLineInput } from "@/lib/billing";
import { serializeItem, serializeBatch } from "@/lib/serialize";

const REQUIRES_PRESCRIPTION: readonly string[] = ["H", "H1", "X"];

export async function getPosData() {
  const session = await requireSession();
  const tenantId = session.user.tenantId;

  const [items, customers, doctors, branch, tenant] = await Promise.all([
    prisma.item.findMany({
      where: { tenantId, batches: { some: { currentQty: { gt: 0 } } } },
      include: { batches: { where: { currentQty: { gt: 0 } }, orderBy: { expiryDate: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.doctor.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.branch.findFirst({ where: { tenantId } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
  ]);

  return {
    items: items.map((item) => ({
      ...serializeItem(item),
      batches: item.batches.map(serializeBatch),
    })),
    customers: customers.map((c) => ({
      ...c,
      creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
      outstandingBalance: Number(c.outstandingBalance),
    })),
    doctors,
    branchId: branch?.id ?? null,
    staffDiscountCapPercent: Number(tenant.staffDiscountCapPercent),
    role: session.user.role,
  };
}

export async function verifyManagerPin(pin: string) {
  const session = await requireSession();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } });
  if (!tenant.managerPinHash) return false;
  return bcrypt.compare(pin, tenant.managerPinHash);
}

const quickDoctorSchema = z.object({
  name: z.string().trim().min(1),
  registrationNo: z.string().trim().optional(),
  clinicName: z.string().trim().optional(),
});

export async function quickAddDoctor(input: z.infer<typeof quickDoctorSchema>) {
  const session = await requireSession();
  const parsed = quickDoctorSchema.parse(input);
  const doctor = await prisma.doctor.create({
    data: { ...parsed, tenantId: session.user.tenantId },
  });
  revalidatePath("/pos");
  return doctor;
}

const saleLineSchema = z.object({
  itemId: z.string().min(1),
  batchId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
});

const completeSaleSchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().optional().nullable(),
  doctorId: z.string().optional().nullable(),
  patientName: z.string().trim().optional(),
  patientAge: z.coerce.number().int().positive().optional(),
  paymentMode: z.enum(["cash", "upi", "card", "credit"]),
  billDiscount: z.object({
    isPercent: z.boolean(),
    value: z.coerce.number().min(0),
  }),
  managerPin: z.string().optional(),
  lines: z.array(saleLineSchema).min(1, "Cart is empty"),
});

export type CompleteSaleInput = z.infer<typeof completeSaleSchema>;


async function checkDiscountCap(
  tenantId: string,
  role: string,
  percent: number,
  managerPin: string | undefined
) {
  if (role !== "counter_staff") return;
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const cap = Number(tenant.staffDiscountCapPercent);
  if (percent <= cap) return;
  if (!managerPin || !tenant.managerPinHash) {
    throw new Error("MANAGER_PIN_REQUIRED");
  }
  const valid = await bcrypt.compare(managerPin, tenant.managerPinHash);
  if (!valid) throw new Error("MANAGER_PIN_REQUIRED");
}

export async function completeSale(input: CompleteSaleInput) {
  const session = await requireSession();
  const tenantId = session.user.tenantId;
  const parsed = completeSaleSchema.parse(input);

  const batchIds = parsed.lines.map((l) => l.batchId);
  const batches = await prisma.batch.findMany({
    where: { id: { in: batchIds }, item: { tenantId } },
    include: { item: true },
  });
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  for (const line of parsed.lines) {
    const batch = batchMap.get(line.batchId);
    if (!batch || batch.itemId !== line.itemId) {
      throw new Error("One of the items in the cart is no longer available.");
    }
    if (batch.currentQty < line.qty) {
      throw new Error(
        `Only ${batch.currentQty} unit(s) of ${batch.item.name} (batch ${batch.batchNo}) left in stock.`
      );
    }
  }

  const needsPrescription = parsed.lines.some((l) =>
    REQUIRES_PRESCRIPTION.includes(batchMap.get(l.batchId)!.item.scheduleClass)
  );
  if (needsPrescription && (!parsed.doctorId || !parsed.patientName)) {
    throw new Error(
      "A doctor and patient name are required for prescription (Schedule H/H1/X) items."
    );
  }

  if (parsed.paymentMode === "credit") {
    if (!parsed.customerId) {
      throw new Error("Select a customer with a credit limit for credit sales.");
    }
    const customer = await prisma.customer.findFirst({
      where: { id: parsed.customerId, tenantId },
    });
    if (!customer || customer.creditLimit === null) {
      throw new Error("Selected customer does not have a credit account.");
    }
  }

  const billingLines: BillingLineInput[] = parsed.lines.map((l) => {
    const batch = batchMap.get(l.batchId)!;
    return {
      lineId: `${l.itemId}:${l.batchId}`,
      qty: l.qty,
      rate: Number(batch.saleRate),
      taxRate: Number(batch.item.taxRate),
      discountPercent: l.discountPercent,
    };
  });

  const billing = computeBilling(billingLines, parsed.billDiscount);

  // Discount-cap check, defense in depth (client already gates this).
  for (let i = 0; i < parsed.lines.length; i++) {
    await checkDiscountCap(
      tenantId,
      session.user.role,
      parsed.lines[i].discountPercent,
      parsed.managerPin
    );
  }
  const billDiscountPercent = effectiveDiscountPercent(parsed.billDiscount, billing.subtotal);
  await checkDiscountCap(tenantId, session.user.role, billDiscountPercent, parsed.managerPin);

  const now = new Date();
  const monthKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  const result = await prisma.$transaction(async (tx) => {
    const countThisMonth = await tx.salesInvoice.count({
      where: { tenantId, invoiceNo: { startsWith: `INV-${monthKey}-` } },
    });
    const invoiceNo = `INV-${monthKey}-${String(countThisMonth + 1).padStart(4, "0")}`;

    const invoice = await tx.salesInvoice.create({
      data: {
        tenantId,
        branchId: parsed.branchId,
        customerId: parsed.customerId || null,
        doctorId: parsed.doctorId || null,
        patientName: parsed.patientName || null,
        patientAge: parsed.patientAge ?? null,
        invoiceNo,
        subtotal: billing.subtotal,
        taxAmount: billing.taxAmount,
        discountAmount: billing.discountAmount,
        total: billing.total,
        paymentMode: parsed.paymentMode,
        status: "completed",
      },
    });

    for (let i = 0; i < parsed.lines.length; i++) {
      const line = parsed.lines[i];
      const lineBilling = billing.lines[i];
      const batch = batchMap.get(line.batchId)!;

      const invoiceItem = await tx.salesInvoiceItem.create({
        data: {
          invoiceId: invoice.id,
          itemId: line.itemId,
          batchId: line.batchId,
          qty: line.qty,
          rate: batch.saleRate,
          taxRate: batch.item.taxRate,
          discountAmount: lineBilling.itemDiscountAmount + lineBilling.billDiscountShare,
        },
      });

      if (line.discountPercent > 0) {
        await tx.discount.create({
          data: {
            tenantId,
            invoiceId: invoice.id,
            invoiceItemId: invoiceItem.id,
            type: "item",
            amountOrPercent: line.discountPercent,
            isPercent: true,
            appliedByUserId: session.user.id,
          },
        });
      }

      const updateResult = await tx.batch.updateMany({
        where: { id: line.batchId, currentQty: { gte: line.qty } },
        data: { currentQty: { decrement: line.qty } },
      });
      if (updateResult.count === 0) {
        throw new Error(
          `Stock for ${batch.item.name} (batch ${batch.batchNo}) changed — please review the cart and try again.`
        );
      }
    }

    if (parsed.billDiscount.value > 0) {
      await tx.discount.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          type: "bill",
          amountOrPercent: parsed.billDiscount.value,
          isPercent: parsed.billDiscount.isPercent,
          appliedByUserId: session.user.id,
        },
      });
    }

    if (parsed.paymentMode === "credit" && parsed.customerId) {
      await tx.customer.update({
        where: { id: parsed.customerId },
        data: { outstandingBalance: { increment: billing.total } },
      });
    }

    return invoice;
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "sale.complete",
    entity: "SalesInvoice",
    entityId: result.id,
    after: { invoiceNo: result.invoiceNo, total: billing.total },
  });

  revalidatePath("/items");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");

  return { invoiceId: result.id, invoiceNo: result.invoiceNo };
}
