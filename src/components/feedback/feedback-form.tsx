"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitPublicFeedback } from "@/lib/actions/customer-feedback";
import { cn } from "@/lib/utils";
import { Loader2, Star } from "lucide-react";

export function FeedbackForm({ token }: { token: string }) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (pending || rating === 0) return;
    startTransition(async () => {
      const result = await submitPublicFeedback(token, { rating, comment: comment.trim() || undefined });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="font-medium">Thank you for your feedback!</p>
        <p className="mt-1 text-sm text-muted-foreground">Your response has been recorded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            className="p-1"
          >
            <Star
              className={cn(
                "h-8 w-8 transition-colors",
                (hovered || rating) >= n ? "fill-warning text-warning" : "text-muted-foreground"
              )}
            />
          </button>
        ))}
      </div>

      <Textarea
        placeholder="Anything you'd like to share? (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
      />

      {error && <p className="text-center text-sm text-destructive">{error}</p>}

      <Button onClick={submit} disabled={pending || rating === 0} className="w-full">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Submit feedback
      </Button>
    </div>
  );
}
