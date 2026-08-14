import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, apiErrorResponse } from "@/lib/api-auth";
import { apiGetInvoice } from "@/lib/api-v1";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await authenticateApiRequest(req);
    const { id } = await params;
    const invoice = await apiGetInvoice(tenantId, id);
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: invoice });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
