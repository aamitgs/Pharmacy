"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { createRateContract, updateRateContract, type RateContractInput } from "@/lib/actions/rate-contracts";
import { Plus } from "lucide-react";

const formSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  itemId: z.string().min(1, "Item is required"),
  contractRate: z.coerce.number().positive("Contract rate must be greater than zero"),
  validFrom: z.string().min(1, "Start date is required"),
  validTo: z.string().min(1, "End date is required"),
  active: z.boolean().default(true),
});

type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export interface RateContractDetail {
  id: string;
  customerId: string;
  itemId: string;
  contractRate: number;
  validFrom: string;
  validTo: string;
  active: boolean;
}

export function RateContractForm({
  contract,
  customers,
  items,
  trigger,
}: {
  contract?: RateContractDetail;
  customers: { id: string; name: string; phone: string | null }[];
  items: { id: string; name: string }[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: contract?.customerId ?? "",
      itemId: contract?.itemId ?? "",
      contractRate: contract?.contractRate,
      validFrom: contract?.validFrom.slice(0, 10) ?? "",
      validTo: contract?.validTo.slice(0, 10) ?? "",
      active: contract?.active ?? true,
    },
  });

  function onSubmit(values: FormOutput) {
    startTransition(async () => {
      try {
        const input: RateContractInput = { ...values };
        if (contract) {
          await updateRateContract(contract.id, input);
          toast.success("Rate contract updated");
        } else {
          await createRateContract(input);
          toast.success("Rate contract created");
          form.reset();
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> New rate contract
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contract ? "Edit rate contract" : "New rate contract"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <Select
              value={form.watch("customerId")}
              onValueChange={(v) => form.setValue("customerId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` (${c.phone})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.customerId && (
              <p className="text-xs text-destructive">{form.formState.errors.customerId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Item</Label>
            <Select value={form.watch("itemId")} onValueChange={(v) => form.setValue("itemId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select item" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.itemId && (
              <p className="text-xs text-destructive">{form.formState.errors.itemId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contractRate">Contract rate (₹)</Label>
            <Input id="contractRate" type="number" min={0} step="0.01" {...form.register("contractRate")} />
            {form.formState.errors.contractRate && (
              <p className="text-xs text-destructive">{form.formState.errors.contractRate.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="validFrom">Valid from</Label>
              <Input id="validFrom" type="date" {...form.register("validFrom")} />
              {form.formState.errors.validFrom && (
                <p className="text-xs text-destructive">{form.formState.errors.validFrom.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="validTo">Valid to</Label>
              <Input id="validTo" type="date" {...form.register("validTo")} />
              {form.formState.errors.validTo && (
                <p className="text-xs text-destructive">{form.formState.errors.validTo.message}</p>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.watch("active")}
              onCheckedChange={(v) => form.setValue("active", !!v)}
            />
            Active
          </label>

          <Button type="submit" disabled={pending}>
            {contract ? "Save changes" : "Create rate contract"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
