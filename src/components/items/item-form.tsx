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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createItem, updateItem, type ItemInput } from "@/lib/actions/items";
import type { PlainItem } from "@/lib/serialize";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  genericName: z.string().trim().optional(),
  manufacturer: z.string().trim().optional(),
  composition: z.string().trim().optional(),
  scheduleClass: z.enum(["none", "H", "H1", "X", "G"]),
  hsnCode: z.string().trim().optional(),
  taxRate: z.coerce.number().min(0).max(100),
  unit: z.string().trim().min(1, "Unit is required"),
  packSize: z.string().trim().optional(),
  reorderLevel: z.coerce.number().int().min(0),
});

// zod v4 gives coerce.number() an `unknown` input type distinct from its
// `number` output type, so the form's field type (pre-coercion, used by
// defaultValues/register) and the resolver's transformed output type
// (post-coercion, used by onSubmit) have to be threaded through separately —
// see react-hook-form's 3rd useForm generic (TTransformedValues).
type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export function ItemForm({ item }: { item?: PlainItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: item?.name ?? "",
      genericName: item?.genericName ?? "",
      manufacturer: item?.manufacturer ?? "",
      composition: item?.composition ?? "",
      scheduleClass: item?.scheduleClass ?? "none",
      hsnCode: item?.hsnCode ?? "",
      taxRate: item ? Number(item.taxRate) : 12,
      unit: item?.unit ?? "unit",
      packSize: item?.packSize ?? "",
      reorderLevel: item?.reorderLevel ?? 10,
    },
  });

  function onSubmit(values: FormOutput) {
    startTransition(async () => {
      try {
        if (item) {
          await updateItem(item.id, values as ItemInput);
          toast.success("Item updated");
          router.push(`/items/${item.id}`);
        } else {
          const created = await createItem(values as ItemInput);
          toast.success("Item created");
          router.push(`/items/${created.id}`);
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
          <Label htmlFor="genericName">Generic name</Label>
          <Input id="genericName" {...form.register("genericName")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manufacturer">Manufacturer</Label>
          <Input id="manufacturer" {...form.register("manufacturer")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="composition">Composition</Label>
          <Input id="composition" {...form.register("composition")} />
        </div>
        <div className="space-y-1.5">
          <Label>Schedule class</Label>
          <Select
            value={form.watch("scheduleClass")}
            onValueChange={(v) => form.setValue("scheduleClass", v as FormValues["scheduleClass"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="H">H</SelectItem>
              <SelectItem value="H1">H1</SelectItem>
              <SelectItem value="X">X</SelectItem>
              <SelectItem value="G">G</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hsnCode">HSN code</Label>
          <Input id="hsnCode" {...form.register("hsnCode")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="taxRate">Tax rate (%)</Label>
          <Input id="taxRate" type="number" step="0.01" {...form.register("taxRate")} />
          {form.formState.errors.taxRate && (
            <p className="text-xs text-destructive">{form.formState.errors.taxRate.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit">Unit</Label>
          <Input id="unit" placeholder="strip, bottle, unit…" {...form.register("unit")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="packSize">Pack size</Label>
          <Input id="packSize" placeholder="10 tablets" {...form.register("packSize")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reorderLevel">Reorder level</Label>
          <Input id="reorderLevel" type="number" {...form.register("reorderLevel")} />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {item ? "Save changes" : "Create item"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
