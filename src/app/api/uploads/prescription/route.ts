import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rbac";
import { savePrescriptionImage, PrescriptionUploadError } from "@/lib/prescription-storage";

export async function POST(request: NextRequest) {
  const session = await requireSession();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  try {
    const path = await savePrescriptionImage(session.user.tenantId, file);
    return NextResponse.json({ path });
  } catch (e) {
    if (e instanceof PrescriptionUploadError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
