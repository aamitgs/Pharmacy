"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createWard } from "@/lib/actions/wards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

const WARD_TYPE_LABELS: Record<string, string> = {
  icu: "ICU",
  ot: "OT",
  general: "General",
  pharmacy_substore: "Pharmacy sub-store",
};

interface WardRow {
  id: string;
  name: string;
  type: string;
  branchId: string;
  branchName: string;
}

export function WardsPanel({
  initialWards,
  branches,
}: {
  initialWards: WardRow[];
  branches: { id: string; name: string }[];
}) {
  const [wards, setWards] = useState(initialWards);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [name, setName] = useState("");
  const [type, setType] = useState("general");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!branchId) {
      toast.error("Add a branch first, in Branches.");
      return;
    }
    if (!name.trim()) {
      toast.error("Ward name is required");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createWard({ branchId, name: name.trim(), type: type as CreateWardType });
        const branch = branches.find((b) => b.id === branchId);
        setWards((w) => [...w, { id: result.id, name: name.trim(), type, branchId, branchName: branch?.name ?? "" }]);
        setName("");
        toast.success("Ward created");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not create ward");
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="wardBranch">Branch</Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger id="wardBranch" className="h-9 w-48">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wardName">Ward name</Label>
          <Input id="wardName" className="w-44" placeholder="e.g. ICU-1" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wardType">Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="wardType" className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(WARD_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={submit} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Add ward
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ward</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Branch</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {wards.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                No wards yet.
              </TableCell>
            </TableRow>
          )}
          {wards.map((w) => (
            <TableRow key={w.id}>
              <TableCell>{w.name}</TableCell>
              <TableCell>{WARD_TYPE_LABELS[w.type] ?? w.type}</TableCell>
              <TableCell>{w.branchName}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type CreateWardType = "icu" | "ot" | "general" | "pharmacy_substore";
