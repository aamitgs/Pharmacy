import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, apiErrorResponse } from "@/lib/api-auth";
import { apiListStock } from "@/lib/api-v1";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await authenticateApiRequest(req);
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 100), 500);
    const stock = await apiListStock(tenantId, { limit });
    return NextResponse.json({ data: stock });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
