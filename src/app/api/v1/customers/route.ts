import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, apiErrorResponse } from "@/lib/api-auth";
import { apiListCustomers } from "@/lib/api-v1";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await authenticateApiRequest(req);
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 200);
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    const customers = await apiListCustomers(tenantId, { limit, cursor });
    return NextResponse.json({ data: customers });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
