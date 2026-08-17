"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { completeCertification } from "@/lib/actions/certification";
import { ScanBarcode, Percent, ShieldAlert, DownloadCloud, Loader2 } from "lucide-react";

const STEPS = [
  {
    icon: ScanBarcode,
    title: "Item search & billing",
    body: "On the Billing screen, use the search box to find an item by name, generic name, or by scanning its barcode. Selecting a result adds it to the cart with the nearest-expiry batch already chosen for you — adjust the quantity directly in the cart if needed.",
  },
  {
    icon: Percent,
    title: "Applying a discount correctly",
    body: "Adjust a single line's discount % right in the cart, or apply a bill-level discount below it. If a discount goes above the pharmacy's set cap, you'll be asked for a manager PIN — enter it when prompted rather than working around the limit.",
  },
  {
    icon: ShieldAlert,
    title: "Handling a Schedule H sale",
    body: "Items marked Schedule H, H1, or X need extra care: attach a photo of the prescription using the button next to the cart, and the sale needs a pharmacist's sign-off before it can complete — your own if you're a Pharmacist, or a pharmacist's credentials if you're Counter Staff.",
  },
  {
    icon: DownloadCloud,
    title: "Running a manual backup",
    body: "Anyone with backup access can trigger one anytime from Settings → Backup → \"Backup now\". It's worth checking the Dashboard occasionally too — a stale backup shows up there as an overdue warning.",
  },
];

/**
 * Phase 10.3: a single guided walkthrough, not an LMS — four short steps
 * covering the core daily workflows, shown once per login session to a new
 * Counter Staff/Pharmacist user until they complete it. "Skip for now"
 * just closes the dialog for this session; it reappears next login until
 * the user reaches the end and clicks "Mark as complete".
 */
export function StaffWalkthrough({ open: initialOpen }: { open: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [stepIndex, setStepIndex] = useState(0);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const Icon = step.icon;

  function finish() {
    startTransition(async () => {
      try {
        await completeCertification();
        setOpen(false);
        toast.success("You're certified — welcome aboard!");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save — try again");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-4.5 w-4.5" />
            </div>
            <DialogTitle>{step.title}</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-sm leading-relaxed text-foreground">
            {step.body}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-1.5 py-1">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${i === stepIndex ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Skip for now
          </Button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStepIndex((i) => i - 1)}>
                Back
              </Button>
            )}
            {isLastStep ? (
              <Button size="sm" onClick={finish} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Mark as complete
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStepIndex((i) => i + 1)}>
                Next
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
