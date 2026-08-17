import { auth } from "@/auth";
import { getTallyExportXml } from "@/lib/actions/tally-export";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { Download, Info } from "lucide-react";

export default async function TallyExportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const { from, to } = defaultMonthRange(await searchParams);
  const result = await getTallyExportXml(from, to);

  return (
    <div className="max-w-2xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Tally Export</h1>
        <p className="text-sm text-muted-foreground">
          Sales, purchases, customer receipts, and supplier payments for{" "}
          {format(new Date(from), "dd MMM yyyy")} – {format(new Date(to), "dd MMM yyyy")} as a
          Tally-importable XML file.
        </p>
      </div>

      <DateRangeFilter from={from} to={to} basePath="/reports/tally-export" />

      <div className="rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">Vouchers in this period</div>
        <div className="text-2xl font-semibold tabular-nums">{result.voucherCount}</div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground sm:grid-cols-4">
          <div>Sales: <span className="font-medium text-foreground">{result.salesCount}</span></div>
          <div>Purchase: <span className="font-medium text-foreground">{result.purchaseCount}</span></div>
          <div>Receipt: <span className="font-medium text-foreground">{result.receiptCount}</span></div>
          <div>Payment: <span className="font-medium text-foreground">{result.paymentCount}</span></div>
        </div>
      </div>

      <Button asChild disabled={result.voucherCount === 0}>
        <a href={`/api/export/tally-vouchers?from=${from}&to=${to}`}>
          <Download className="h-4 w-4" /> Download Tally XML
        </a>
      </Button>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          In Tally: <strong>Gateway of Tally &gt; Import Data &gt; Vouchers</strong>, then select
          this file. Standard ledger names are used (Sales Account, Purchase Account, Output
          CGST/SGST, Input CGST/SGST, Cash, Bank, Round Off) plus your customers&apos;/suppliers&apos;
          own names as party ledgers — Tally will prompt to auto-create any that don&apos;t exist
          yet on first import. Review the created ledgers against your existing chart of accounts
          before relying on this for filing; this hasn&apos;t been tested against a real Tally
          instance.
        </AlertDescription>
      </Alert>
    </div>
  );
}
