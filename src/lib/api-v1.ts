import "server-only";
import { z } from "zod";
import { prisma, runInTenantTransaction, tenantContext } from "@/lib/prisma";
import { computeBilling, type BillingLineInput } from "@/lib/billing";
import { ApiAuthError } from "@/lib/api-auth";

const REQUIRES_PRESCRIPTION: readonly string[] = ["H", "H1", "X"];

/** Every function here runs the actual queries *inside* tenantContext.run()'s
 * callback (awaited there, not just returned) — Prisma's lazy PrismaPromise
 * only gets dispatched on `.then()`, and if that happens outside run()'s
 * synchronous scope the AsyncLocalStorage context is already gone. See
 * src/lib/prisma.ts for the full explanation. */
function asTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantContext.run({ tenantId }, async () => await fn());
}

export async function apiListInvoices(tenantId: string, params: { limit: number; cursor?: string }) {
  return asTenant(tenantId, async () => {
    const invoices = await prisma.salesInvoice.findMany({
      where: { tenantId },
      orderBy: { invoiceDate: "desc" },
      take: params.limit,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
      select: {
        id: true,
        invoiceNo: true,
        invoiceDate: true,
        status: true,
        paymentMode: true,
        subtotal: true,
        taxAmount: true,
        discountAmount: true,
        total: true,
        customerId: true,
      },
    });
    return invoices.map((inv) => ({
      ...inv,
      subtotal: Number(inv.subtotal),
      taxAmount: Number(inv.taxAmount),
      discountAmount: Number(inv.discountAmount),
      total: Number(inv.total),
    }));
  });
}

export async function apiGetInvoice(tenantId: string, id: string) {
  return asTenant(tenantId, async () => {
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id, tenantId },
      include: { items: { include: { item: { select: { name: true } }, batch: { select: { batchNo: true } } } } },
    });
    if (!invoice) return null;
    return {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      invoiceDate: invoice.invoiceDate,
      status: invoice.status,
      paymentMode: invoice.paymentMode,
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.taxAmount),
      discountAmount: Number(invoice.discountAmount),
      total: Number(invoice.total),
      items: invoice.items.map((line) => ({
        itemName: line.item.name,
        batchNo: line.batch.batchNo,
        qty: line.qty,
        rate: Number(line.rate),
        taxRate: Number(line.taxRate),
      })),
    };
  });
}

export async function apiListStock(tenantId: string, params: { limit: number }) {
  return asTenant(tenantId, async () => {
    const items = await prisma.item.findMany({
      where: { tenantId },
      take: params.limit,
      orderBy: { name: "asc" },
      include: { batches: { select: { batchNo: true, expiryDate: true, currentQty: true, mrp: true } } },
    });
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      hsnCode: item.hsnCode,
      unit: item.unit,
      totalQty: item.batches.reduce((sum, b) => sum + b.currentQty, 0),
      batches: item.batches.map((b) => ({
        batchNo: b.batchNo,
        expiryDate: b.expiryDate,
        qty: b.currentQty,
        mrp: Number(b.mrp),
      })),
    }));
  });
}

export async function apiListCustomers(tenantId: string, params: { limit: number; cursor?: string }) {
  return asTenant(tenantId, async () => {
    const customers = await prisma.customer.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      take: params.limit,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
      select: { id: true, name: true, phone: true, creditLimit: true, outstandingBalance: true },
    });
    return customers.map((c) => ({
      ...c,
      creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
      outstandingBalance: Number(c.outstandingBalance),
    }));
  });
}

const createSaleSchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().optional(),
  paymentMode: z.enum(["cash", "upi", "card"]),
  items: z.array(z.object({ itemId: z.string().min(1), qty: z.number().int().positive() })).min(1),
});

export type ApiCreateSaleInput = z.infer<typeof createSaleSchema>;

/**
 * A deliberately narrower "create sale" than the POS screen's completeSale:
 * no prescription capture, manager-PIN discount overrides, schemes, or
 * coupons — the common case for a headless integration (e.g. an e-commerce
 * storefront placing an order). Batches are auto-selected FEFO (earliest
 * expiry with enough stock), matching the discipline the POS enforces
 * automatically; Schedule H/H1/X items are rejected outright since they
 * need a pharmacist's prescription sign-off that only the POS UI can
 * collect.
 */
export async function apiCreateSale(tenantId: string, input: unknown) {
  const parsed = createSaleSchema.parse(input);

  return asTenant(tenantId, async () => {
    const branch = await prisma.branch.findFirst({ where: { id: parsed.branchId, tenantId } });
    if (!branch) throw new Error("Invalid branchId");

    if (parsed.customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: parsed.customerId, tenantId } });
      if (!customer) throw new Error("Invalid customerId");
    }

    const itemIds = parsed.items.map((l) => l.itemId);
    const items = await prisma.item.findMany({ where: { id: { in: itemIds }, tenantId } });
    const itemMap = new Map(items.map((i) => [i.id, i]));
    for (const line of parsed.items) {
      const item = itemMap.get(line.itemId);
      if (!item) throw new Error(`Unknown itemId: ${line.itemId}`);
      if (REQUIRES_PRESCRIPTION.includes(item.scheduleClass)) {
        throw new Error(`${item.name} requires a prescription and can't be sold via the API — use the POS screen.`);
      }
    }

    // FEFO batch pick per line, at this branch, with enough stock.
    const chosenBatches = new Map<string, { id: string; batchNo: string; saleRate: number }>();
    for (const line of parsed.items) {
      const batch = await prisma.batch.findFirst({
        where: { itemId: line.itemId, branchId: parsed.branchId, currentQty: { gte: line.qty } },
        orderBy: { expiryDate: "asc" },
      });
      if (!batch) {
        throw new Error(`Not enough stock of ${itemMap.get(line.itemId)!.name} at this branch.`);
      }
      chosenBatches.set(line.itemId, { id: batch.id, batchNo: batch.batchNo, saleRate: Number(batch.saleRate) });
    }

    const billingLines: BillingLineInput[] = parsed.items.map((line) => {
      const item = itemMap.get(line.itemId)!;
      const batch = chosenBatches.get(line.itemId)!;
      return { lineId: line.itemId, qty: line.qty, rate: batch.saleRate, taxRate: Number(item.taxRate), discountPercent: 0 };
    });
    const billing = computeBilling(billingLines, []);

    const now = new Date();
    const monthKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    return runInTenantTransaction(async (tx) => {
      const countThisMonth = await tx.salesInvoice.count({
        where: { tenantId, invoiceNo: { startsWith: `INV-${monthKey}-` } },
      });
      const invoiceNo = `INV-${monthKey}-${String(countThisMonth + 1).padStart(4, "0")}`;

      const invoice = await tx.salesInvoice.create({
        data: {
          tenantId,
          branchId: parsed.branchId,
          customerId: parsed.customerId || null,
          invoiceNo,
          subtotal: billing.subtotal,
          taxAmount: billing.taxAmount,
          discountAmount: billing.discountAmount,
          total: billing.total,
          paymentMode: parsed.paymentMode,
          status: "completed",
        },
      });

      for (let i = 0; i < parsed.items.length; i++) {
        const line = parsed.items[i];
        const batch = chosenBatches.get(line.itemId)!;
        await tx.salesInvoiceItem.create({
          data: {
            invoiceId: invoice.id,
            itemId: line.itemId,
            batchId: batch.id,
            qty: line.qty,
            rate: batch.saleRate,
            taxRate: Number(itemMap.get(line.itemId)!.taxRate),
          },
        });
        await tx.batch.update({ where: { id: batch.id }, data: { currentQty: { decrement: line.qty } } });
      }

      return { invoiceId: invoice.id, invoiceNo, total: billing.total };
    });
  });
}

// ---------------------------------------------------------------------------
// Hospital Mode (Phase 7) — a hospital's own separate HIS is meant to be
// just one consumer of these, using the same key/docs pattern as everything
// above; nothing here is specific to any particular integration.
// ---------------------------------------------------------------------------

async function requireHospitalApiTenant(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (tenant.tenantType !== "hospital") {
    throw new ApiAuthError("This endpoint is only available for hospital-mode tenants.", 403);
  }
}

export async function apiListWards(tenantId: string) {
  return asTenant(tenantId, async () => {
    await requireHospitalApiTenant(tenantId);
    const wards = await prisma.ward.findMany({ where: { tenantId }, orderBy: { name: "asc" } });
    return wards.map((w) => ({ id: w.id, name: w.name, type: w.type, branchId: w.branchId }));
  });
}

const upsertAdmissionSchema = z.object({
  admissionRef: z.string().min(1),
  patientName: z.string().min(1),
  wardId: z.string().min(1),
  // Pass an ISO timestamp to mark/update a discharge, null to clear one
  // (re-admit), or omit to leave discharge status untouched on an update.
  dischargedAt: z.string().datetime().nullable().optional(),
});

export type ApiUpsertAdmissionInput = z.infer<typeof upsertAdmissionSchema>;

/** Create or update (by admissionRef) — lets an external HIS push admission
 * data instead of the in-app manual-entry form doing the only writing. */
export async function apiUpsertAdmission(tenantId: string, input: unknown) {
  const parsed = upsertAdmissionSchema.parse(input);

  return asTenant(tenantId, async () => {
    await requireHospitalApiTenant(tenantId);

    const ward = await prisma.ward.findFirst({ where: { id: parsed.wardId, tenantId } });
    if (!ward) throw new Error("Invalid wardId");

    const admission = await prisma.patientAdmission.upsert({
      where: { tenantId_admissionRef: { tenantId, admissionRef: parsed.admissionRef } },
      create: {
        tenantId,
        admissionRef: parsed.admissionRef,
        patientName: parsed.patientName,
        wardId: parsed.wardId,
        dischargedAt: parsed.dischargedAt ? new Date(parsed.dischargedAt) : null,
      },
      update: {
        patientName: parsed.patientName,
        wardId: parsed.wardId,
        ...(parsed.dischargedAt !== undefined
          ? { dischargedAt: parsed.dischargedAt ? new Date(parsed.dischargedAt) : null }
          : {}),
      },
    });

    return { id: admission.id, admissionRef: admission.admissionRef };
  });
}

/** Consumption/charges by admission — what an external HIS pulls to build
 * the patient's actual hospital bill (this app never builds that bill
 * itself). `rate` is the batch's own sale rate; `amount` is a convenience
 * multiplication, not a computed invoice. */
export async function apiGetAdmissionConsumption(tenantId: string, admissionRef: string) {
  return asTenant(tenantId, async () => {
    await requireHospitalApiTenant(tenantId);

    const admission = await prisma.patientAdmission.findFirst({
      where: { tenantId, admissionRef },
      include: {
        ward: { select: { name: true } },
        dispenses: {
          include: {
            item: { select: { name: true, unit: true } },
            batch: { select: { batchNo: true, saleRate: true } },
          },
          orderBy: { dispensedAt: "asc" },
        },
      },
    });
    if (!admission) return null;

    return {
      admissionRef: admission.admissionRef,
      patientName: admission.patientName,
      wardName: admission.ward.name,
      admittedAt: admission.admittedAt,
      dischargedAt: admission.dischargedAt,
      consumption: admission.dispenses.map((d) => {
        const rate = Number(d.batch.saleRate);
        const netQty = d.qty - d.returnedQty;
        return {
          itemName: d.item.name,
          unit: d.item.unit,
          batchNo: d.batch.batchNo,
          qty: d.qty,
          returnedQty: d.returnedQty,
          netQty,
          rate,
          amount: rate * netQty,
          dispensedAt: d.dispensedAt,
        };
      }),
    };
  });
}

export async function apiGetWardStock(tenantId: string, wardId: string) {
  return asTenant(tenantId, async () => {
    await requireHospitalApiTenant(tenantId);

    const ward = await prisma.ward.findFirst({ where: { id: wardId, tenantId } });
    if (!ward) return null;

    const batches = await prisma.batch.findMany({
      where: { wardId, currentQty: { gt: 0 } },
      include: { item: { select: { name: true, unit: true } } },
      orderBy: { expiryDate: "asc" },
    });

    return {
      wardId: ward.id,
      wardName: ward.name,
      stock: batches.map((b) => ({
        itemName: b.item.name,
        unit: b.item.unit,
        batchNo: b.batchNo,
        expiryDate: b.expiryDate,
        qty: b.currentQty,
      })),
    };
  });
}

export async function apiGetWardConsumption(tenantId: string, wardId: string, params: { limit: number }) {
  return asTenant(tenantId, async () => {
    await requireHospitalApiTenant(tenantId);

    const ward = await prisma.ward.findFirst({ where: { id: wardId, tenantId } });
    if (!ward) return null;

    const dispenses = await prisma.ipdDispense.findMany({
      where: { tenantId, admission: { wardId } },
      include: {
        item: { select: { name: true, unit: true } },
        admission: { select: { admissionRef: true, patientName: true } },
      },
      orderBy: { dispensedAt: "desc" },
      take: params.limit,
    });

    return {
      wardId: ward.id,
      wardName: ward.name,
      consumption: dispenses.map((d) => ({
        admissionRef: d.admission.admissionRef,
        patientName: d.admission.patientName,
        itemName: d.item.name,
        unit: d.item.unit,
        qty: d.qty,
        returnedQty: d.returnedQty,
        dispensedAt: d.dispensedAt,
      })),
    };
  });
}
