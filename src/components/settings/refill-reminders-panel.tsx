"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { setRefillRemindersEnabled, runRefillRemindersNow } from "@/lib/actions/refill-reminders";
import { toast } from "sonner";
import { Loader2, MessageCircle, Send } from "lucide-react";
import type { RefillReminderRunResult } from "@/lib/refill-reminders/detect";

export function RefillRemindersPanel({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [toggling, startToggle] = useTransition();
  const [running, startRun] = useTransition();
  const [lastRun, setLastRun] = useState<RefillReminderRunResult | null>(null);

  function toggle(next: boolean) {
    setEnabled(next);
    startToggle(async () => {
      try {
        await setRefillRemindersEnabled(next);
        toast.success(next ? "Refill reminders enabled" : "Refill reminders disabled");
      } catch (e) {
        setEnabled(!next);
        toast.error(e instanceof Error ? e.message : "Could not update setting");
      }
    });
  }

  function runNow() {
    startRun(async () => {
      try {
        const result = await runRefillRemindersNow();
        setLastRun(result);
        toast.success(`Checked ${result.checked} due purchase cycle(s) — sent ${result.sent}, failed ${result.failed}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Run failed");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-medium">Refill reminders</h2>
        <p className="text-sm text-muted-foreground">
          Detects when an opted-in customer is likely due to reorder an item — based on their own
          past purchase interval for that item, not a fixed schedule — and sends a WhatsApp
          reminder. Off by default for the pharmacy and for every customer; a customer only
          receives reminders once both this toggle and their own opt-in (on their customer detail
          page) are on.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="refill-reminders-toggle" className="text-sm font-medium">
            Enable refill reminders for this pharmacy
          </Label>
          <p className="text-xs text-muted-foreground">
            When on, the scheduled job and the button below will message opted-in customers.
          </p>
        </div>
        <Switch id="refill-reminders-toggle" checked={enabled} disabled={toggling} onCheckedChange={toggle} />
      </div>

      <Button onClick={runNow} disabled={!enabled || running} variant="outline">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Send reminders now
      </Button>

      {lastRun && (
        <Alert>
          <MessageCircle className="h-4 w-4" />
          <AlertDescription>
            Checked {lastRun.checked} due purchase cycle(s) — sent {lastRun.sent}, failed{" "}
            {lastRun.failed}
            {lastRun.skippedNoPhone > 0 && `, ${lastRun.skippedNoPhone} skipped (no phone on file)`}.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Scheduled reminders (self-hosted)</p>
        <p className="mt-1">
          For an automatic daily run, point an OS-level cron (or your container
          orchestrator&apos;s scheduler) at <code>POST /api/refill-reminders/scheduled</code> with
          header <code>x-refill-reminders-secret: $REFILL_REMINDERS_CRON_SECRET</code>. It checks
          every tenant with reminders enabled, the same detection logic as the button above. See
          the README for a sample crontab entry.
        </p>
      </div>
    </div>
  );
}
