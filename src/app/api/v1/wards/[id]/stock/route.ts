import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, apiErrorResponse } from "@/lib/api-auth";
import { apiGetWardStock } from "@/lib/api-v1";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await authenticateApiRequest(req);
    const { id } = await params;
    const result = await apiGetWardStock(tenantId, id);
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: result });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
