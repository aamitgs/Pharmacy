"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setRollupOptIn, leaveFranchiseGroup } from "@/lib/actions/franchise";

export function FranchiseMemberView({
  groupName,
  rollupOptIn,
}: {
  groupName: string;
  rollupOptIn: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(rollupOptIn);
  const [toggling, startToggle] = useTransition();
  const [leaving, startLeave] = useTransition();

  function toggle(next: boolean) {
    setEnabled(next);
    startToggle(async () => {
      try {
        await setRollupOptIn(next);
        toast.success(next ? "Sales rollup sharing enabled" : "Sales rollup sharing disabled");
      } catch (err) {
        setEnabled(!next);
        toast.error(err instanceof Error ? err.message : "Could not update setting");
      }
    });
  }

  function leave() {
    startLeave(async () => {
      try {
        await leaveFranchiseGroup();
        toast.success("Left the franchise group");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not leave group");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Member of {groupName}</CardTitle>
        <CardDescription>
          Your data stays fully separate — the franchisor never sees your raw sales, only an
          aggregate total if you opt in below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="rollup-toggle" className="text-sm font-medium">
              Share sales &amp; margin totals with the franchisor
            </Label>
            <p className="text-xs text-muted-foreground">
              Off by default. Only a summed total (not individual sales) is ever shared.
            </p>
          </div>
          <Switch id="rollup-toggle" checked={enabled} disabled={toggling} onCheckedChange={toggle} />
        </div>

        <Button variant="outline" onClick={leave} disabled={leaving}>
          Leave franchise group
        </Button>
      </CardContent>
    </Card>
  );
}
