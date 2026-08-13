"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBranchSettings } from "@/lib/actions/branch-settings";
import type { LicenseType } from "@/lib/license-types";

const LICENSE_FIELDS: { type: LicenseType; label: string; numberField: "drugLicenseRetailNo" | "drugLicenseWholesaleNo" | "narcoticLicenseNo" | "fssaiNo" }[] = [
  { type: "retail", label: "Retail drug license", numberField: "drugLicenseRetailNo" },
  { type: "wholesale", label: "Wholesale drug license", numberField: "drugLicenseWholesaleNo" },
  { type: "narcotic", label: "Narcotic license", numberField: "narcoticLicenseNo" },
  { type: "fssai", label: "FSSAI registration", numberField: "fssaiNo" },
];

export function CompliancePanel({
  initial,
}: {
  initial: {
    drugLicenseRetailNo: string | null;
    drugLicenseWholesaleNo: string | null;
    narcoticLicenseNo: string | null;
    fssaiNo: string | null;
    licenseExpiryDates: Partial<Record<LicenseType, string>>;
    licenseExpiryWindowDays: number;
  };
}) {
  const [numbers, setNumbers] = useState({
    drugLicenseRetailNo: initial.drugLicenseRetailNo ?? "",
    drugLicenseWholesaleNo: initial.drugLicenseWholesaleNo ?? "",
    narcoticLicenseNo: initial.narcoticLicenseNo ?? "",
    fssaiNo: initial.fssaiNo ?? "",
  });
  const [expiryDates, setExpiryDates] = useState<Partial<Record<LicenseType, string>>>(
    initial.licenseExpiryDates
  );
  const [windowDays, setWindowDays] = useState(String(initial.licenseExpiryWindowDays));
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        await updateBranchSettings({
          ...numbers,
          licenseExpiryDates: expiryDates,
          licenseExpiryWindowDays: Number(windowDays) || 60,
        });
        toast.success("Compliance profile updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save changes");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-sm font-medium">Licenses &amp; expiry dates</h2>
        <p className="text-sm text-muted-foreground">
          Tracked on the Alerts screen and dashboard — renewals due soon are surfaced automatically.
        </p>
      </div>

      <div className="space-y-4">
        {LICENSE_FIELDS.map(({ type, label, numberField }) => (
          <div key={type} className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`num-${type}`}>{label} no.</Label>
              <Input
                id={`num-${type}`}
                value={numbers[numberField]}
                onChange={(e) => setNumbers((n) => ({ ...n, [numberField]: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`exp-${type}`}>{label} expiry</Label>
              <Input
                id={`exp-${type}`}
                type="date"
                value={expiryDates[type] ?? ""}
                onChange={(e) => setExpiryDates((d) => ({ ...d, [type]: e.target.value }))}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 max-w-xs">
        <Label htmlFor="expiryWindow">Renewal warning window (days)</Label>
        <Input
          id="expiryWindow"
          type="number"
          min={1}
          value={windowDays}
          onChange={(e) => setWindowDays(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Licenses expiring within this many days appear on Alerts and the dashboard.
        </p>
      </div>

      <Button disabled={pending} onClick={submit}>
        Save compliance profile
      </Button>
    </div>
  );
}
