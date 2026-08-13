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
import { createSupplier, updateSupplier, type SupplierInput } from "@/lib/actions/suppliers";
import type { PlainSupplier } from "@/lib/serialize";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  gstin: z.string().trim().optional(),
  address: z.string().trim().optional(),
  paymentTermsDays: z.coerce.number().int().min(0).optional(),
});

// See item-form.tsx for why input/output types are split (zod v4 coerce).
type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export function SupplierForm({ supplier }: { supplier?: PlainSupplier }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: supplier?.name ?? "",
      gstin: supplier?.gstin ?? "",
      address: supplier?.address ?? "",
      paymentTermsDays: supplier?.paymentTermsDays ?? undefined,
    },
  });

  function onSubmit(values: FormOutput) {
    startTransition(async () => {
      try {
        if (supplier) {
          await updateSupplier(supplier.id, values as SupplierInput);
          toast.success("Supplier updated");
          router.push(`/suppliers/${supplier.id}`);
        } else {
          const created = await createSupplier(values as SupplierInput);
          toast.success("Supplier created");
          router.push(`/suppliers/${created.id}`);
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
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
          <Label htmlFor="address">Address</Label>
          <Input id="address" {...form.register("address")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paymentTermsDays">Payment terms (days)</Label>
          <Input
            id="paymentTermsDays"
            type="number"
            placeholder="e.g. 30"
            {...form.register("paymentTermsDays")}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {supplier ? "Save changes" : "Create supplier"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
