"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { quickAddDoctor } from "@/lib/actions/pos";
import type { PosDoctor } from "./types";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export function PrescriptionFields({
  doctors,
  doctorId,
  onDoctorChange,
  patientName,
  onPatientNameChange,
  patientAge,
  onPatientAgeChange,
  onDoctorCreated,
}: {
  doctors: PosDoctor[];
  doctorId: string | null;
  onDoctorChange: (id: string) => void;
  patientName: string;
  onPatientNameChange: (v: string) => void;
  patientAge: string;
  onPatientAgeChange: (v: string) => void;
  onDoctorCreated: (doctor: PosDoctor) => void;
}) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [newDoctorName, setNewDoctorName] = useState("");
  const [newDoctorReg, setNewDoctorReg] = useState("");
  const [pending, startTransition] = useTransition();

  function submitQuickAdd() {
    if (!newDoctorName.trim()) return;
    startTransition(async () => {
      try {
        const doctor = await quickAddDoctor({
          name: newDoctorName.trim(),
          registrationNo: newDoctorReg.trim() || undefined,
        });
        onDoctorCreated(doctor);
        onDoctorChange(doctor.id);
        setQuickAddOpen(false);
        setNewDoctorName("");
        setNewDoctorReg("");
        toast.success("Doctor added");
      } catch {
        toast.error("Could not add doctor");
      }
    });
  }

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
      <p className="mb-2 text-xs font-medium text-warning-foreground">
        Prescription required — this cart contains a Schedule H/H1/X item.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Doctor</Label>
          <div className="flex gap-1">
            <Select value={doctorId ?? undefined} onValueChange={onDoctorChange}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select doctor" />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setQuickAddOpen(true)}
              aria-label="Add new doctor"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Patient name</Label>
          <Input
            className="h-8"
            value={patientName}
            onChange={(e) => onPatientNameChange(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Patient age</Label>
          <Input
            className="h-8"
            type="number"
            value={patientAge}
            onChange={(e) => onPatientAgeChange(e.target.value)}
          />
        </div>
      </div>

      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add doctor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                autoFocus
                value={newDoctorName}
                onChange={(e) => setNewDoctorName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitQuickAdd()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Registration no.</Label>
              <Input
                value={newDoctorReg}
                onChange={(e) => setNewDoctorReg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitQuickAdd()}
              />
            </div>
            <Button disabled={pending || !newDoctorName.trim()} onClick={submitQuickAdd}>
              Add doctor
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
