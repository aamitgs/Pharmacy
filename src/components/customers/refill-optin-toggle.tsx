"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setCustomerRefillOptIn } from "@/lib/actions/refill-reminders";
import { toast } from "sonner";

export function RefillOptInToggle({ customerId, initialOptIn }: { customerId: string; initialOptIn: boolean }) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setOptIn(next);
    startTransition(async () => {
      try {
        await setCustomerRefillOptIn(customerId, next);
        toast.success(next ? "Refill reminders on for this customer" : "Refill reminders off for this customer");
      } catch (e) {
        setOptIn(!next);
        toast.error(e instanceof Error ? e.message : "Could not update");
      }
    });
  }

  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="space-y-0.5">
        <Label htmlFor={`refill-optin-${customerId}`} className="text-sm font-medium">
          WhatsApp refill reminders
        </Label>
        <p className="text-xs text-muted-foreground">
          When on, this customer gets a WhatsApp nudge when they&apos;re likely due to reorder an
          item they&apos;ve bought before.
        </p>
      </div>
      <Switch id={`refill-optin-${customerId}`} checked={optIn} disabled={pending} onCheckedChange={toggle} />
    </div>
  );
}
