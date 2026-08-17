"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateRefillRequestStatus } from "@/lib/actions/refill-requests";
import { Check, X } from "lucide-react";

export function RefillRequestActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(status: "fulfilled" | "dismissed") {
    startTransition(async () => {
      try {
        await updateRefillRequestStatus(id, status);
        toast.success(status === "fulfilled" ? "Marked fulfilled" : "Dismissed");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => run("fulfilled")}>
        <Check className="h-4 w-4" /> Fulfilled
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run("dismissed")}>
        <X className="h-4 w-4" /> Dismiss
      </Button>
    </div>
  );
}
