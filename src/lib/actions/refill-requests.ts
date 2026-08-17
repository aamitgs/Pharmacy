"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "@/lib/rbac";

/** Staff-facing side of the customer portal's refill requests (src/lib/actions/customer-portal.ts creates them). */
export async function listRefillRequests(status?: "pending" | "fulfilled" | "dismissed") {
  const session = await requireRetailSession();
  const requests = await prisma.refillRequest.findMany({
    where: { tenantId: session.user.tenantId, ...(status ? { status } : {}) },
    include: {
      customer: { select: { name: true, phone: true } },
      invoice: { select: { id: true, invoiceNo: true, invoiceDate: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return requests.map((r) => ({
    id: r.id,
    customerName: r.customer.name,
    customerPhone: r.customer.phone,
    invoiceId: r.invoice?.id ?? null,
    invoiceNo: r.invoice?.invoiceNo ?? null,
    invoiceDate: r.invoice?.invoiceDate ?? null,
    note: r.note,
    status: r.status,
    createdAt: r.createdAt,
    fulfilledAt: r.fulfilledAt,
  }));
}

export async function countPendingRefillRequests(tenantId: string) {
  return prisma.refillRequest.count({ where: { tenantId, status: "pending" } });
}

const updateStatusSchema = z.object({ status: z.enum(["fulfilled", "dismissed"]) });

export async function updateRefillRequestStatus(id: string, status: "fulfilled" | "dismissed") {
  const session = await requireRetailSession();
  const parsed = updateStatusSchema.parse({ status });

  const request = await prisma.refillRequest.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!request) throw new Error("Refill request not found");
  if (request.status !== "pending") throw new Error("This request has already been handled.");

  await prisma.refillRequest.update({
    where: { id },
    data: { status: parsed.status, fulfilledAt: parsed.status === "fulfilled" ? new Date() : null },
  });

  revalidatePath("/refill-requests");
  revalidatePath("/dashboard");
}
