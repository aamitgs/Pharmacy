import { NextRequest, NextResponse } from "next/server";
import { getSchemeBenefitsReport } from "@/lib/actions/reports";
import { defaultMonthRange } from "@/lib/date-range";
import { toCsv } from "@/lib/csv";
import { format } from "date-fns";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const rows = await getSchemeBenefitsReport(from, to);

  const csv = toCsv(rows, [
    { key: (r) => format(new Date(r.receivedAt), "yyyy-MM-dd"), label: "Date" },
    { key: "supplierName", label: "Distributor" },
    { key: "manufacturer", label: "Manufacturer" },
    { key: "itemName", label: "Item" },
    { key: "batchNo", label: "Batch" },
    { key: "qty", label: "Qty" },
    { key: "rate", label: "Rate" },
    { key: "freeQty", label: "Free qty" },
    { key: "freeGoodsValue", label: "Free goods value" },
    { key: "schemeDiscountPercent", label: "CD %" },
    { key: "cashDiscountValue", label: "Cash discount value" },
    { key: "totalBenefit", label: "Total benefit" },
    { key: (r) => r.schemeNote ?? "", label: "Note" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="scheme-benefits-${from}-to-${to}.csv"`,
    },
  });
}
