"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setFeedbackRequestsEnabled } from "@/lib/actions/customer-feedback";
import { toast } from "sonner";

export function FeedbackPanel({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setEnabled(next);
    startTransition(async () => {
      try {
        await setFeedbackRequestsEnabled(next);
        toast.success(next ? "Feedback requests enabled" : "Feedback requests disabled");
      } catch (e) {
        setEnabled(!next);
        toast.error(e instanceof Error ? e.message : "Could not update setting");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-medium">Customer feedback</h2>
        <p className="text-sm text-muted-foreground">
          Sends a WhatsApp link after every completed sale (when the customer has a phone number on
          file) asking for a 1-5 rating and an optional comment. See the results in Reports &gt;
          Customer Feedback.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="feedback-toggle" className="text-sm font-medium">
            Send post-sale feedback requests
          </Label>
          <p className="text-xs text-muted-foreground">Off by default for the pharmacy.</p>
        </div>
        <Switch id="feedback-toggle" checked={enabled} disabled={pending} onCheckedChange={toggle} />
      </div>
    </div>
  );
}
