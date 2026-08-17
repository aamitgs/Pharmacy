"use server";

import { z } from "zod";
import crypto from "node:crypto";
import { basePrisma, prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { getBranchFilter } from "@/lib/branch-scope";
import { sendWhatsAppMessage } from "@/lib/whatsapp/provider";

function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * Fire-and-forget, called right after a sale completes (src/lib/actions/pos.ts)
 * — same "keeps running after the response is sent, never blocks checkout,
 * failures are swallowed" contract as runEinvoiceAttempt in
 * src/lib/gsp/engine.ts, which this mirrors (re-fetches everything from the
 * invoice id rather than trusting anything passed in).
 */
export async function sendFeedbackRequestForInvoice(invoiceId: string): Promise<void> {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: invoiceId },
    include: { tenant: true, customer: true },
  });
  if (!invoice || !invoice.tenant.feedbackRequestsEnabled) return;
  if (!invoice.customerId || !invoice.customer?.phone) return;

  const existing = await prisma.customerFeedback.findUnique({ where: { invoiceId } });
  if (existing) return;

  const token = generateToken();
  await prisma.customerFeedback.create({
    data: {
      tenantId: invoice.tenantId,
      branchId: invoice.branchId,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      token,
    },
  });

  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  await sendWhatsAppMessage({
    to: invoice.customer.phone,
    text: `Thanks for shopping at ${invoice.tenant.pharmacyName}! We'd love your feedback on invoice ${invoice.invoiceNo} — rate your visit here: ${base}/feedback/${token}`,
  });

  await prisma.whatsAppLog.create({
    data: {
      tenantId: invoice.tenantId,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      phone: invoice.customer.phone,
      messageType: "feedback",
      status: "sent",
    },
  });
}

/**
 * Public, unauthenticated lookup — possession of the link (the token) is
 * the only "auth" a post-sale feedback request has, same bootstrapping
 * problem as the customer portal's pre-login OTP lookups, same fix: read
 * via basePrisma with the RLS bypass flag rather than through a tenant
 * session that doesn't exist yet.
 */
export async function getPublicFeedbackByToken(token: string) {
  const [, feedback] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.customerFeedback.findUnique({
      where: { token },
      include: { tenant: { select: { pharmacyName: true, logoUrl: true, primaryColor: true } } },
    }),
  ]);
  if (!feedback) return null;
  return {
    tenant: feedback.tenant,
    submitted: feedback.submittedAt !== null,
    rating: feedback.rating,
    comment: feedback.comment,
  };
}

const submitSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export async function submitPublicFeedback(
  token: string,
  input: { rating: number; comment?: string }
): Promise<{ ok: boolean; error?: string }> {
  const parsed = submitSchema.parse(input);

  const [, feedback] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.customerFeedback.findUnique({ where: { token } }),
  ]);
  if (!feedback) return { ok: false, error: "This feedback link is invalid." };
  if (feedback.submittedAt) return { ok: false, error: "Feedback has already been submitted for this link." };

  await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.customerFeedback.update({
      where: { id: feedback.id },
      data: { rating: parsed.rating, comment: parsed.comment || null, submittedAt: new Date() },
    }),
  ]);
  return { ok: true };
}

export async function getFeedbackSettings() {
  const session = await requireRole(["owner"]);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } });
  return { enabled: tenant.feedbackRequestsEnabled };
}

export async function setFeedbackRequestsEnabled(enabled: boolean) {
  const session = await requireRole(["owner"]);
  await prisma.tenant.update({ where: { id: session.user.tenantId }, data: { feedbackRequestsEnabled: enabled } });
}

export interface FeedbackReport {
  averageRating: number | null;
  totalResponses: number;
  distribution: { rating: number; count: number }[];
  trend: { date: string; averageRating: number; count: number }[];
  comments: {
    id: string;
    rating: number;
    comment: string | null;
    submittedAt: string;
    customerName: string | null;
    branchName: string;
  }[];
}

/** Owner-facing report — filterable by date (the `from`/`to` pair) and by
 * branch (implicitly, via the same branch-scope switcher every other
 * screen in the app already uses — see getBranchFilter). */
export async function getFeedbackReport(from: string, to: string): Promise<FeedbackReport> {
  const session = await requireRole(["owner", "pharmacist"]);
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);

  const fromDate = new Date(from);
  const toDate = new Date(new Date(to).getTime() + 86400000 - 1);

  const rows = await prisma.customerFeedback.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...branchFilter,
      submittedAt: { not: null, gte: fromDate, lte: toDate },
    },
    include: { customer: { select: { name: true } }, branch: { select: { name: true } } },
    orderBy: { submittedAt: "desc" },
  });

  const totalResponses = rows.length;
  const averageRating =
    totalResponses > 0 ? rows.reduce((sum, r) => sum + (r.rating ?? 0), 0) / totalResponses : null;

  const distribution = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: rows.filter((r) => r.rating === rating).length,
  }));

  const byDay = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    const day = r.submittedAt!.toISOString().slice(0, 10);
    const entry = byDay.get(day) ?? { sum: 0, count: 0 };
    entry.sum += r.rating ?? 0;
    entry.count += 1;
    byDay.set(day, entry);
  }
  const trend = [...byDay.entries()]
    .map(([date, { sum, count }]) => ({ date, averageRating: sum / count, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const comments = rows
    .filter((r) => r.comment)
    .map((r) => ({
      id: r.id,
      rating: r.rating!,
      comment: r.comment,
      submittedAt: r.submittedAt!.toISOString(),
      customerName: r.customer?.name ?? null,
      branchName: r.branch.name,
    }));

  return { averageRating, totalResponses, distribution, trend, comments };
}
