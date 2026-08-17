"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SafetyWarning } from "@/lib/interaction-check";
import { TriangleAlert, Info } from "lucide-react";

// Non-blocking by design (Phase 10.2 spec): no dismiss button, no modal —
// it just reflects live cart state, so it can't become something staff
// learn to click through without reading. It clears itself the moment the
// triggering item is removed or the quantities no longer overlap.
export function SafetyAlertsBanner({ warnings }: { warnings: SafetyWarning[] }) {
  const t = useTranslations("pos.safety");
  if (warnings.length === 0) return null;

  return (
    <div className="space-y-1.5 rounded-lg border border-warning/40 bg-warning/10 p-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
        <TriangleAlert className="h-3.5 w-3.5" />
        {t("title")}
      </div>
      <ul className="space-y-1">
        {warnings.map((w) => (
          <li
            key={w.key}
            className={cn(
              "flex items-start gap-1.5 rounded-md px-2 py-1 text-xs",
              w.severity === "warning" ? "bg-destructive/10 text-destructive" : "bg-background text-foreground"
            )}
          >
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{w.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
