"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createPortalRefillRequest } from "@/lib/actions/customer-portal";
import { Loader2 } from "lucide-react";

export function PortalRefillRequestForm({ slug, invoiceId }: { slug: string; invoiceId: string }) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);

  async function submit() {
    if (loading) return;
    setLoading(true);
    try {
      await createPortalRefillRequest(slug, { invoiceId, note: note.trim() || undefined });
      setRequested(true);
      toast.success("Refill request sent to the pharmacy.");
    } catch {
      toast.error("Could not send the request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (requested) {
    return (
      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        Refill requested. The pharmacy will reach out once it&apos;s ready.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Textarea
        placeholder="Anything the pharmacy should know? (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={loading}
        rows={2}
      />
      <Button onClick={submit} disabled={loading} className="w-full">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Request refill
      </Button>
    </div>
  );
}
