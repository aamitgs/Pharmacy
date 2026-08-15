"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { getDiscountReport } from "@/lib/actions/discount-report";

function dateWindow(from: string, to: string) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);
  return { fromDate, toDate };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface SalesTrendPoint {
  date: string;
  revenue: number;
  invoiceCount: number;
}

export interface MarginTrendPoint {
  date: string;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
}

export interface BranchPerformance {
  branchId: string;
  branchName: string;
  revenue: number;
  invoiceCount: number;
  margin: number;
  marginPercent: number;
}

export interface StaffPerformance {
  userId: string;
  userName: string;
  salesCount: number;
  salesRevenue: number;
  discountGiven: number;
}

export interface AnalyticsDashboard {
  salesTrend: SalesTrendPoint[];
  marginTrend: MarginTrendPoint[];
  branchPerformance: BranchPerformance[];
  staffPerformance: StaffPerformance[];
}

/**
 * Owner-only, deliberately cross-branch — this is the one report in the app
 * that does NOT apply the usual branch-scope filter (src/lib/branch-scope.ts):
 * consolidating across every branch is the entire point, with branches
 * broken out explicitly in branchPerformance rather than narrowed to
 * whichever one is currently selected in the header switcher.
 *
 * Revenue/cost/margin are computed per sales-invoice-line (qty*rate -
 * discountAmount, and qty*batch.purchaseRate for cost) — the exact same
 * definition src/lib/actions/margin-movers.ts already uses, not
 * invoice.total (which includes tax), so this dashboard's numbers agree
 * with the existing Margin Report rather than introducing a second
 * "revenue" definition.
 *
 * Staff sales volume has no dedicated column anywhere (SalesInvoice never
 * recorded who rang it up, only who signed off a prescription) — it's
 * derived from the existing sale.complete AuditLog entries instead of a
 * schema change, reusing infrastructure that already exists for a
 * different reason (the audit trail) rather than adding a parallel one.
 * Discount-given per staff reuses getDiscountReport (Phase 4) directly.
 */
export async function getAnalyticsDashboard(from: string, to: string): Promise<AnalyticsDashboard> {
  const session = await requireRole(["owner"]);
  const tenantId = session.user.tenantId;
  const { fromDate, toDate } = dateWindow(from, to);

  const [lines, auditEntries, discountReport, users] = await Promise.all([
    prisma.salesInvoiceItem.findMany({
      where: { invoice: { tenantId, status: "completed", invoiceDate: { gte: fromDate, lte: toDate } } },
      select: {
        qty: true,
        rate: true,
        discountAmount: true,
        batch: { select: { purchaseRate: true } },
        invoice: { select: { id: true, invoiceDate: true, branchId: true, branch: { select: { name: true } } } },
      },
    }),
    prisma.auditLog.findMany({
      where: { tenantId, action: "sale.complete", entity: "SalesInvoice", createdAt: { gte: fromDate, lte: toDate } },
      select: { userId: true, entityId: true },
    }),
    getDiscountReport(from, to),
    prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ]);

  const byDay = new Map<string, { revenue: number; cost: number; invoiceIds: Set<string> }>();
  const byBranch = new Map<string, { name: string; revenue: number; cost: number; invoiceIds: Set<string> }>();

  for (const line of lines) {
    const revenue = line.qty * Number(line.rate) - Number(line.discountAmount);
    const cost = line.qty * Number(line.batch.purchaseRate);
    const dayKey = line.invoice.invoiceDate.toISOString().slice(0, 10);

    const day = byDay.get(dayKey) ?? { revenue: 0, cost: 0, invoiceIds: new Set<string>() };
    day.revenue += revenue;
    day.cost += cost;
    day.invoiceIds.add(line.invoice.id);
    byDay.set(dayKey, day);

    const branch = byBranch.get(line.invoice.branchId) ?? {
      name: line.invoice.branch.name,
      revenue: 0,
      cost: 0,
      invoiceIds: new Set<string>(),
    };
    branch.revenue += revenue;
    branch.cost += cost;
    branch.invoiceIds.add(line.invoice.id);
    byBranch.set(line.invoice.branchId, branch);
  }

  const salesTrend: SalesTrendPoint[] = Array.from(byDay.entries())
    .map(([date, d]) => ({ date, revenue: round2(d.revenue), invoiceCount: d.invoiceIds.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const marginTrend: MarginTrendPoint[] = Array.from(byDay.entries())
    .map(([date, d]) => {
      const margin = d.revenue - d.cost;
      return {
        date,
        revenue: round2(d.revenue),
        cost: round2(d.cost),
        margin: round2(margin),
        marginPercent: d.revenue > 0 ? round2((margin / d.revenue) * 100) : 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const branchPerformance: BranchPerformance[] = Array.from(byBranch.entries())
    .map(([branchId, b]) => {
      const margin = b.revenue - b.cost;
      return {
        branchId,
        branchName: b.name,
        revenue: round2(b.revenue),
        invoiceCount: b.invoiceIds.size,
        margin: round2(margin),
        marginPercent: b.revenue > 0 ? round2((margin / b.revenue) * 100) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // The audit trail is only the attribution source here (which user rang
  // up which invoice) — the actual rupee figure comes from SalesInvoice
  // itself (subtotal - discountAmount, the same pre-tax "revenue"
  // definition used everywhere else on this dashboard), not the invoice
  // total cached in the audit entry's `after` JSON at the time of sale,
  // so this section's numbers agree with the rest of the page rather than
  // silently using a different (tax-inclusive) definition of "revenue".
  const invoiceIds = [...new Set(auditEntries.map((e) => e.entityId))];
  const invoicesForStaff = invoiceIds.length
    ? await prisma.salesInvoice.findMany({
        where: { id: { in: invoiceIds }, tenantId },
        select: { id: true, subtotal: true, discountAmount: true },
      })
    : [];
  const revenueByInvoiceId = new Map(
    invoicesForStaff.map((inv) => [inv.id, Number(inv.subtotal) - Number(inv.discountAmount)])
  );

  const userNameById = new Map(users.map((u) => [u.id, u.name]));
  const salesByStaff = new Map<string, { count: number; revenue: number }>();
  for (const entry of auditEntries) {
    const revenue = revenueByInvoiceId.get(entry.entityId) ?? 0;
    const s = salesByStaff.get(entry.userId) ?? { count: 0, revenue: 0 };
    s.count += 1;
    s.revenue += revenue;
    salesByStaff.set(entry.userId, s);
  }
  const discountByStaff = new Map(discountReport.byStaff.map((d) => [d.userId, d.amount]));
  const staffIds = new Set([...salesByStaff.keys(), ...discountByStaff.keys()]);
  const staffPerformance: StaffPerformance[] = Array.from(staffIds)
    .map((userId) => ({
      userId,
      userName: userNameById.get(userId) ?? "Unknown",
      salesCount: salesByStaff.get(userId)?.count ?? 0,
      salesRevenue: round2(salesByStaff.get(userId)?.revenue ?? 0),
      discountGiven: round2(discountByStaff.get(userId) ?? 0),
    }))
    .sort((a, b) => b.salesRevenue - a.salesRevenue);

  return { salesTrend, marginTrend, branchPerformance, staffPerformance };
}
