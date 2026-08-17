import { NextRequest, NextResponse } from "next/server";
import { getTallyExportXml } from "@/lib/actions/tally-export";
import { defaultMonthRange } from "@/lib/date-range";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const { xml } = await getTallyExportXml(from, to);

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="tally-vouchers-${from}-to-${to}.xml"`,
    },
  });
}
