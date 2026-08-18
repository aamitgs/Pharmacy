import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, apiErrorResponse } from "@/lib/api-auth";
import { apiListInvoices } from "@/lib/api-v1";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await authenticateApiRequest(req, "invoices:read");
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 200);
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    const invoices = await apiListInvoices(tenantId, { limit, cursor });
    return NextResponse.json({ data: invoices });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
