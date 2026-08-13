"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createBranch, updateBranch } from "@/lib/actions/branches";
import type { LicenseType } from "@/lib/license-types";

const formSchema = z.object({
  name: z.string().trim().min(1, "Branch name is required"),
  licensedAddress: z.string().trim().min(1, "Licensed address is required"),
  gstin: z.string().trim().optional(),
  pan: z.string().trim().optional(),
  drugLicenseRetailNo: z.string().trim().optional(),
  drugLicenseWholesaleNo: z.string().trim().optional(),
  narcoticLicenseNo: z.string().trim().optional(),
  fssaiNo: z.string().trim().optional(),
  pharmacistName: z.string().trim().optional(),
  pharmacistRegistrationNo: z.string().trim().optional(),
  retailExpiry: z.string().optional(),
  wholesaleExpiry: z.string().optional(),
  narcoticExpiry: z.string().optional(),
  fssaiExpiry: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export interface BranchDetail {
  id: string;
  name: string;
  licensedAddress: string;
  gstin: string | null;
  pan: string | null;
  drugLicenseRetailNo: string | null;
  drugLicenseWholesaleNo: string | null;
  narcoticLicenseNo: string | null;
  fssaiNo: string | null;
  pharmacistName: string | null;
  pharmacistRegistrationNo: string | null;
  licenseExpiryDates: Partial<Record<LicenseType, string>>;
}

export function BranchForm({ branch }: { branch?: BranchDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: branch?.name ?? "",
      licensedAddress: branch?.licensedAddress ?? "",
      gstin: branch?.gstin ?? "",
      pan: branch?.pan ?? "",
      drugLicenseRetailNo: branch?.drugLicenseRetailNo ?? "",
      drugLicenseWholesaleNo: branch?.drugLicenseWholesaleNo ?? "",
      narcoticLicenseNo: branch?.narcoticLicenseNo ?? "",
      fssaiNo: branch?.fssaiNo ?? "",
      pharmacistName: branch?.pharmacistName ?? "",
      pharmacistRegistrationNo: branch?.pharmacistRegistrationNo ?? "",
      retailExpiry: branch?.licenseExpiryDates.retail ?? "",
      wholesaleExpiry: branch?.licenseExpiryDates.wholesale ?? "",
      narcoticExpiry: branch?.licenseExpiryDates.narcotic ?? "",
      fssaiExpiry: branch?.licenseExpiryDates.fssai ?? "",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        const payload = {
          name: values.name,
          licensedAddress: values.licensedAddress,
          gstin: values.gstin,
          pan: values.pan,
          drugLicenseRetailNo: values.drugLicenseRetailNo,
          drugLicenseWholesaleNo: values.drugLicenseWholesaleNo,
          narcoticLicenseNo: values.narcoticLicenseNo,
          fssaiNo: values.fssaiNo,
          pharmacistName: values.pharmacistName,
          pharmacistRegistrationNo: values.pharmacistRegistrationNo,
          licenseExpiryDates: {
            retail: values.retailExpiry,
            wholesale: values.wholesaleExpiry,
            narcotic: values.narcoticExpiry,
            fssai: values.fssaiExpiry,
          },
        };
        if (branch) {
          await updateBranch(branch.id, payload);
          toast.success("Branch updated");
          router.push("/branches");
        } else {
          const created = await createBranch(payload);
          toast.success("Branch created");
          router.push(`/branches/${created.id}`);
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Branch name</Label>
          <Input id="name" autoFocus {...form.register("name")} />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gstin">GSTIN</Label>
          <Input id="gstin" {...form.register("gstin")} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="licensedAddress">Licensed address</Label>
          <Input id="licensedAddress" {...form.register("licensedAddress")} />
          {form.formState.errors.licensedAddress && (
            <p className="text-xs text-destructive">{form.formState.errors.licensedAddress.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pan">PAN</Label>
          <Input id="pan" {...form.register("pan")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pharmacistName">Pharmacist-in-charge</Label>
          <Input id="pharmacistName" {...form.register("pharmacistName")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pharmacistRegistrationNo">Pharmacist reg. no.</Label>
          <Input id="pharmacistRegistrationNo" {...form.register("pharmacistRegistrationNo")} />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h2 className="text-sm font-medium">Licenses &amp; expiry dates</h2>
        <div className="grid grid-cols-2 gap-3">
          <Label className="col-span-2 -mb-2 text-xs text-muted-foreground">Retail drug license</Label>
          <Input placeholder="License no." {...form.register("drugLicenseRetailNo")} />
          <Input type="date" {...form.register("retailExpiry")} />

          <Label className="col-span-2 -mb-2 text-xs text-muted-foreground">Wholesale drug license</Label>
          <Input placeholder="License no." {...form.register("drugLicenseWholesaleNo")} />
          <Input type="date" {...form.register("wholesaleExpiry")} />

          <Label className="col-span-2 -mb-2 text-xs text-muted-foreground">Narcotic license</Label>
          <Input placeholder="License no." {...form.register("narcoticLicenseNo")} />
          <Input type="date" {...form.register("narcoticExpiry")} />

          <Label className="col-span-2 -mb-2 text-xs text-muted-foreground">FSSAI registration</Label>
          <Input placeholder="Registration no." {...form.register("fssaiNo")} />
          <Input type="date" {...form.register("fssaiExpiry")} />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {branch ? "Save changes" : "Create branch"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
