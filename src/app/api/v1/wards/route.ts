import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, apiErrorResponse } from "@/lib/api-auth";
import { apiListWards } from "@/lib/api-v1";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await authenticateApiRequest(req);
    const wards = await apiListWards(tenantId);
    return NextResponse.json({ data: wards });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
