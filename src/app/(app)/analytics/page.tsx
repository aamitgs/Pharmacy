import { auth } from "@/auth";
import { getAnalyticsDashboard } from "@/lib/actions/analytics";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { SalesTrendChart } from "@/components/analytics/sales-trend-chart";
import { MarginTrendChart } from "@/components/analytics/margin-trend-chart";
import { BranchPerformanceChart } from "@/components/analytics/branch-performance-chart";
import { StaffPerformanceTable } from "@/components/analytics/staff-performance-table";
import { format } from "date-fns";
import { ShieldAlert } from "lucide-react";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  if (session.user.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Restricted to Owner</p>
        <p className="text-sm">This cross-branch dashboard isn&apos;t available to other accounts.</p>
      </div>
    );
  }

  const params = await searchParams;
  const { from, to } = defaultMonthRange(params);
  const { salesTrend, marginTrend, branchPerformance, staffPerformance } = await getAnalyticsDashboard(from, to);

  const totalRevenue = branchPerformance.reduce((sum, b) => sum + b.revenue, 0);
  const totalMargin = branchPerformance.reduce((sum, b) => sum + b.margin, 0);
  const totalInvoices = branchPerformance.reduce((sum, b) => sum + b.invoiceCount, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(from), "dd MMM yyyy")} – {format(new Date(to), "dd MMM yyyy")} · ₹{totalRevenue.toFixed(2)} revenue
            across {branchPerformance.length} branch{branchPerformance.length === 1 ? "" : "es"} · {totalInvoices} sales · ₹
            {totalMargin.toFixed(2)} margin
          </p>
        </div>
      </div>

      <DateRangeFilter from={from} to={to} basePath="/analytics" />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Sales trend</h2>
          <div className="rounded-lg border p-3">
            <SalesTrendChart data={salesTrend} />
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Margin trend</h2>
          <div className="rounded-lg border p-3">
            <MarginTrendChart data={marginTrend} />
          </div>
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Branch performance</h2>
        <p className="text-xs text-muted-foreground">
          Ranked by revenue — best performer in green, lowest in red (also readable from the branch names and order alone).
        </p>
        <div className="rounded-lg border p-3">
          <BranchPerformanceChart data={branchPerformance} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Staff performance</h2>
        <p className="text-xs text-muted-foreground">
          Sales volume is derived from the audit trail (no counter-staff field exists on an invoice itself); discount given reuses
          the Discount Report.
        </p>
        <StaffPerformanceTable data={staffPerformance} />
      </section>
    </div>
  );
}
