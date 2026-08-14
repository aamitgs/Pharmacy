import Link from "next/link";
import { getAdmissionDetail } from "@/lib/actions/admissions";
import { Badge } from "@/components/ui/badge";
import { AdmissionDetail } from "@/components/admissions/admission-detail";
import { ChevronLeft } from "lucide-react";

export default async function AdmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admission = await getAdmissionDetail(id);

  return (
    <div className="space-y-4 p-6">
      <Link href="/admissions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Patient Admissions
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          {admission.patientName}
          {admission.dischargedAt && <Badge variant="outline">Discharged</Badge>}
        </h1>
        <p className="text-sm text-muted-foreground">
          {admission.admissionRef} · {admission.wardName}
        </p>
      </div>
      <AdmissionDetail
        admissionId={admission.id}
        discharged={!!admission.dischargedAt}
        availableBatches={admission.availableBatches}
        initialDispenses={admission.dispenses}
      />
    </div>
  );
}
