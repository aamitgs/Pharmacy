"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { setOwnOverridePin, clearOwnOverridePin } from "@/lib/actions/override-pin";
import { PIN_DIGITS } from "@/lib/discount-override";
import { AlertCircle, CheckCircle2, KeyRound } from "lucide-react";
import { toast } from "sonner";

/**
 * Lets an owner or pharmacist set their own discount-override PIN. There is
 * deliberately no way to set someone else's, and no way to read an existing
 * one back — only whether one is set.
 */
export function OverridePinCard({ isSet }: { isSet: boolean }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    if (pin !== confirm) {
      setError("The two PINs don't match.");
      return;
    }
    startTransition(async () => {
      const res = await setOwnOverridePin(pin);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPin("");
      setConfirm("");
      toast.success(isSet ? "Override PIN changed" : "Override PIN set");
    });
  }

  function clear() {
    startTransition(async () => {
      await clearOwnOverridePin();
      toast.success("Override PIN removed");
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="h-4 w-4" />
          Discount override PIN
          {isSet ? (
            <Badge variant="outline" className="text-[10px]">
              Set
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              Not set
            </Badge>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">
          Counter staff enter this PIN when a discount goes above the shop&apos;s cap. It is
          yours alone — the sale records <em>your</em> name as the approver, so don&apos;t share
          it, and set your own rather than borrowing a colleague&apos;s.
        </p>
      </div>

      {isSet && (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-success" />
          <AlertDescription>
            Your PIN is set. Enter a new one below to change it.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="override-pin" className="text-xs">
            {isSet ? "New PIN" : "PIN"} ({PIN_DIGITS} digits)
          </Label>
          <Input
            id="override-pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={PIN_DIGITS}
            value={pin}
            disabled={pending}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="max-w-[12rem]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="override-pin-confirm" className="text-xs">
            Confirm PIN
          </Label>
          <Input
            id="override-pin-confirm"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={PIN_DIGITS}
            value={confirm}
            disabled={pending}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
            className="max-w-[12rem]"
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button size="sm" disabled={pin.length !== PIN_DIGITS || pending} onClick={save}>
            {isSet ? "Change PIN" : "Set PIN"}
          </Button>
          {isSet && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={clear}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
