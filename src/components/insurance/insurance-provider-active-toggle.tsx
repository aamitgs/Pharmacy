"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { setInsuranceProviderActive } from "@/lib/actions/insurance-providers";

export function InsuranceProviderActiveToggle({ providerId, initialActive }: { providerId: string; initialActive: boolean }) {
  const [active, setActive] = useState(initialActive);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setActive(next);
    startTransition(async () => {
      try {
        await setInsuranceProviderActive(providerId, next);
      } catch (e) {
        setActive(!next);
        toast.error(e instanceof Error ? e.message : "Could not update");
      }
    });
  }

  return <Switch checked={active} disabled={pending} onCheckedChange={toggle} />;
}
