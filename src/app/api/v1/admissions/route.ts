import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, apiErrorResponse } from "@/lib/api-auth";
import { apiUpsertAdmission } from "@/lib/api-v1";

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await authenticateApiRequest(req, "admissions:write");
    const body = await req.json();
    const result = await apiUpsertAdmission(tenantId, body);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
