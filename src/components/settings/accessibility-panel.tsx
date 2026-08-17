"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setHighContrast } from "@/lib/actions/accessibility";

export function AccessibilityPanel({ initialHighContrast }: { initialHighContrast: boolean }) {
  const [enabled, setEnabled] = useState(initialHighContrast);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setEnabled(next);
    startTransition(async () => {
      try {
        await setHighContrast(next);
        // Full reload, not router.refresh(): the theme class lives on
        // AppShell (a parent layout), and a soft refresh doesn't reliably
        // re-render that far up the tree — same lesson as the language
        // switcher's own reload (src/components/language-switcher.tsx).
        window.location.reload();
      } catch (e) {
        setEnabled(!next);
        toast.error(e instanceof Error ? e.message : "Could not update setting");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-medium">Accessibility</h2>
        <p className="text-sm text-muted-foreground">
          Your own display preference for this account — independent of the pharmacy&apos;s own
          settings, same as language.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="high-contrast-toggle" className="text-sm font-medium">
            High-contrast theme
          </Label>
          <p className="text-xs text-muted-foreground">
            Stronger text, border, and status colors — meets WCAG AA contrast requirements.
            Useful at a counter with bright ambient light or an older monitor.
          </p>
        </div>
        <Switch id="high-contrast-toggle" checked={enabled} disabled={pending} onCheckedChange={toggle} />
      </div>
    </div>
  );
}
