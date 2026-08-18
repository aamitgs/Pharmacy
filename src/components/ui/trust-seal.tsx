import { LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Phase 11.5: the app's one signature "trust" motif — a vault/ledger-lock
 * cue, used deliberately only on the security/backup settings screens
 * where it reinforces the message (encryption, MFA, off-device backup),
 * not scattered decoratively elsewhere in the app.
 */
export function TrustSeal({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/5 text-primary",
        className
      )}
      aria-hidden="true"
    >
      <LockKeyhole className="size-3.5" />
    </span>
  );
}
