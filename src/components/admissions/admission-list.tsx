"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { createAdmission, dischargeAdmission } from "@/lib/actions/admissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

interface AdmissionRow {
  id: string;
  admissionRef: string;
  patientName: string;
  wardId: string;
  wardName: string;
  admittedAt: Date;
  dischargedAt: Date | null;
}

export function AdmissionList({
  initialAdmissions,
  wards,
}: {
  initialAdmissions: AdmissionRow[];
  wards: { id: string; name: string }[];
}) {
  const [admissions, setAdmissions] = useState(initialAdmissions);
  const [admissionRef, setAdmissionRef] = useState("");
  const [patientName, setPatientName] = useState("");
  const [wardId, setWardId] = useState(wards[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [dischargingId, setDischargingId] = useState<string | null>(null);

  function submit() {
    if (!admissionRef.trim() || !patientName.trim() || !wardId) {
      toast.error("Fill in admission reference, patient name, and ward.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createAdmission({ admissionRef: admissionRef.trim(), patientName: patientName.trim(), wardId });
        const ward = wards.find((w) => w.id === wardId);
        setAdmissions((a) => [
          {
            id: result.id,
            admissionRef: admissionRef.trim(),
            patientName: patientName.trim(),
            wardId,
            wardName: ward?.name ?? "",
            admittedAt: new Date(),
            dischargedAt: null,
          },
          ...a,
        ]);
        setAdmissionRef("");
        setPatientName("");
        toast.success("Patient admitted");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not create admission");
      }
    });
  }

  function discharge(id: string) {
    setDischargingId(id);
    startTransition(async () => {
      try {
        await dischargeAdmission(id);
        setAdmissions((a) => a.map((x) => (x.id === id ? { ...x, dischargedAt: new Date() } : x)));
        toast.success("Patient discharged");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not discharge");
      } finally {
        setDischargingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="admissionRef">Admission reference</Label>
          <Input id="admissionRef" className="w-40" value={admissionRef} onChange={(e) => setAdmissionRef(e.target.value)} placeholder="e.g. ADM-1042" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="patientName">Patient name</Label>
          <Input id="patientName" className="w-48" value={patientName} onChange={(e) => setPatientName(e.target.value)} />
        </div>
        {wards.length > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor="admissionWard">Ward</Label>
            <Select value={wardId} onValueChange={setWardId}>
              <SelectTrigger id="admissionWard" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {wards.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button onClick={submit} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Admit patient
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ref</TableHead>
            <TableHead>Patient</TableHead>
            <TableHead>Ward</TableHead>
            <TableHead>Admitted</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {admissions.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                No admissions yet.
              </TableCell>
            </TableRow>
          )}
          {admissions.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <Link href={`/admissions/${a.id}`} className="underline underline-offset-2">
                  {a.admissionRef}
                </Link>
              </TableCell>
              <TableCell>{a.patientName}</TableCell>
              <TableCell>{a.wardName}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{format(a.admittedAt, "dd MMM yyyy")}</TableCell>
              <TableCell>
                {a.dischargedAt ? <Badge variant="outline">Discharged</Badge> : <Badge>Active</Badge>}
              </TableCell>
              <TableCell>
                {!a.dischargedAt && (
                  <Button size="sm" variant="ghost" disabled={pending && dischargingId === a.id} onClick={() => discharge(a.id)}>
                    {pending && dischargingId === a.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    Discharge
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
