import { listAdmissions, getAdmissionFormWards } from "@/lib/actions/admissions";
import { AdmissionList } from "@/components/admissions/admission-list";

export default async function AdmissionsPage() {
  const [admissions, wards] = await Promise.all([listAdmissions(), getAdmissionFormWards()]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">Patient Admissions</h1>
      <AdmissionList initialAdmissions={admissions} wards={wards} />
    </div>
  );
}
