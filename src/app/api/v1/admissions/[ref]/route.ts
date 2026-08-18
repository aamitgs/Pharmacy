import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, apiErrorResponse } from "@/lib/api-auth";
import { apiGetAdmissionConsumption } from "@/lib/api-v1";

/** [ref] is the admissionRef an external HIS knows, not our internal cuid —
 * it pushed that same ref via POST /api/v1/admissions. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { tenantId } = await authenticateApiRequest(req, "admissions:read");
    const { ref } = await params;
    const result = await apiGetAdmissionConsumption(tenantId, decodeURIComponent(ref));
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: result });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
