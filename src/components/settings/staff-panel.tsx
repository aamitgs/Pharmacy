"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createStaffUser, updateWardAssignments } from "@/lib/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { CERTIFIABLE_ROLES } from "@/lib/certification";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  pharmacist: "Pharmacist",
  counter_staff: "Counter Staff",
  ward_nurse: "Ward Nurse",
  ward_pharmacist: "Ward / Duty Pharmacist",
};

interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: string;
  certifiedAt: Date | null;
  wardAssignments: { wardId: string; wardName: string }[];
}

export function StaffPanel({
  initialStaff,
  wards,
  isHospital,
}: {
  initialStaff: StaffRow[];
  wards: { id: string; name: string }[];
  isHospital: boolean;
}) {
  const [staff, setStaff] = useState(initialStaff);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("counter_staff");
  const [wardIds, setWardIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [assignPending, startAssignTransition] = useTransition();

  const roleOptions = isHospital
    ? (["pharmacist", "counter_staff", "ward_nurse", "ward_pharmacist"] as const)
    : (["pharmacist", "counter_staff"] as const);

  function submit() {
    if (!name.trim() || !email.trim() || password.length < 8) {
      toast.error("Fill in name, email, and an 8+ character password.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createStaffUser({
          name: name.trim(),
          email: email.trim(),
          password,
          role: role as "pharmacist" | "counter_staff" | "ward_nurse" | "ward_pharmacist",
          wardIds: role === "ward_nurse" ? wardIds : undefined,
        });
        setStaff((s) => [
          ...s,
          {
            id: result.id,
            name: name.trim(),
            email: email.trim(),
            role,
            certifiedAt: null,
            wardAssignments: wards.filter((w) => wardIds.includes(w.id)).map((w) => ({ wardId: w.id, wardName: w.name })),
          },
        ]);
        setName("");
        setEmail("");
        setPassword("");
        setWardIds([]);
        toast.success("Staff account created");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not create staff account");
      }
    });
  }

  function toggleWardAssignment(userId: string, wardId: string, currentWardIds: string[]) {
    const next = currentWardIds.includes(wardId)
      ? currentWardIds.filter((id) => id !== wardId)
      : [...currentWardIds, wardId];
    startAssignTransition(async () => {
      try {
        await updateWardAssignments(userId, next);
        setStaff((s) =>
          s.map((u) =>
            u.id === userId
              ? { ...u, wardAssignments: wards.filter((w) => next.includes(w.id)).map((w) => ({ wardId: w.id, wardName: w.name })) }
              : u
          )
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update ward assignment");
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="staffName">Name</Label>
          <Input id="staffName" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staffEmail">Email</Label>
          <Input id="staffEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staffPassword">Password</Label>
          <Input id="staffPassword" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staffRole">Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="staffRole">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {role === "ward_nurse" && (
          <div className="col-span-2 space-y-1.5">
            <Label>Assigned ward(s)</Label>
            {wards.length === 0 ? (
              <p className="text-xs text-muted-foreground">No wards yet — add one first, in the Wards tab.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {wards.map((w) => (
                  <label key={w.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={wardIds.includes(w.id)}
                      onCheckedChange={(checked) =>
                        setWardIds((ids) => (checked ? [...ids, w.id] : ids.filter((id) => id !== w.id)))
                      }
                    />
                    {w.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <Button onClick={submit} disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Add staff account
      </Button>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Certified</TableHead>
            {isHospital && <TableHead>Wards</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {staff.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                <Badge variant="outline">{ROLE_LABELS[u.role] ?? u.role}</Badge>
              </TableCell>
              <TableCell>
                {!CERTIFIABLE_ROLES.has(u.role) ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : u.certifiedAt ? (
                  <span className="flex items-center gap-1 text-xs text-success" title={format(u.certifiedAt, "dd MMM yyyy")}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Certified
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Not yet</span>
                )}
              </TableCell>
              {isHospital && (
                <TableCell>
                  {u.role === "ward_nurse" ? (
                    <div className="flex flex-wrap gap-2">
                      {wards.map((w) => {
                        const currentIds = u.wardAssignments.map((wa) => wa.wardId);
                        return (
                          <label key={w.id} className="flex items-center gap-1 text-xs">
                            <Checkbox
                              disabled={assignPending}
                              checked={currentIds.includes(w.id)}
                              onCheckedChange={() => toggleWardAssignment(u.id, w.id, currentIds)}
                            />
                            {w.name}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
