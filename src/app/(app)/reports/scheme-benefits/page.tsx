import { auth } from "@/auth";
import { getSchemeBenefitsReport } from "@/lib/actions/reports";
import { summarizeSchemeBenefitsBySupplier, summarizeSchemeBenefitsByManufacturer } from "@/lib/scheme-benefits";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { PrintButton } from "@/components/reports/print-button";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Download } from "lucide-react";

function SummaryTable({ title, rows }: { title: string; rows: { label: string; freeGoodsValue: number; cashDiscountValue: number; totalBenefit: number }[] }) {
  return (
    <div className="rounded-lg border">
      <div className="border-b px-3 py-2 text-sm font-medium">{title}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Free goods</TableHead>
            <TableHead className="text-right">Cash discount</TableHead>
            <TableHead className="text-right">Total benefit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-right tabular-nums">₹{r.freeGoodsValue.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">₹{r.cashDiscountValue.toFixed(2)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">₹{r.totalBenefit.toFixed(2)}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                No scheme benefit in this period.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function SchemeBenefitsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const { from, to } = defaultMonthRange(await searchParams);
  const rows = await getSchemeBenefitsReport(from, to);
  const bySupplier = summarizeSchemeBenefitsBySupplier(rows);
  const byManufacturer = summarizeSchemeBenefitsByManufacturer(rows);
  const totalBenefit = rows.reduce((sum, r) => sum + r.totalBenefit, 0);

  return (
    <div className="space-y-4 p-6">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>

      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold">Scheme Benefits</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} GRN line{rows.length === 1 ? "" : "s"} with a scheme ·{" "}
            {format(new Date(from), "dd MMM yyyy")} – {format(new Date(to), "dd MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/api/export/scheme-benefits?from=${from}&to=${to}`}>
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
          <PrintButton />
        </div>
      </div>

      <DateRangeFilter from={from} to={to} basePath="/reports/scheme-benefits" />

      <div className="rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">Total scheme benefit received</div>
        <div className="text-2xl font-semibold tabular-nums">₹{totalBenefit.toFixed(2)}</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryTable title="By distributor" rows={bySupplier} />
        <SummaryTable title="By manufacturer" rows={byManufacturer} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Distributor</TableHead>
              <TableHead>Manufacturer</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Free qty</TableHead>
              <TableHead className="text-right">CD %</TableHead>
              <TableHead className="text-right">Benefit</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r, i) => (
                <TableRow key={`${r.grnId}-${i}`}>
                  <TableCell className="whitespace-nowrap text-sm">{format(new Date(r.receivedAt), "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.supplierName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.manufacturer}</TableCell>
                  <TableCell className="font-medium">{r.itemName}</TableCell>
                  <TableCell className="text-sm">{r.batchNo}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.freeQty || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.schemeDiscountPercent ? `${r.schemeDiscountPercent}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">₹{r.totalBenefit.toFixed(2)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.schemeNote || "—"}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                  No scheme benefit in this period.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={8}>Total</TableCell>
                <TableCell className="text-right tabular-nums">₹{totalBenefit.toFixed(2)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
