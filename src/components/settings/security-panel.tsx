"use client";

import { MfaSetupForm } from "@/components/mfa-setup-form";
import { TrustSeal } from "@/components/ui/trust-seal";

export function SecurityPanel({ totpEnabled }: { totpEnabled: boolean }) {
  return (
    <div className="max-w-md space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <TrustSeal />
          Two-factor authentication
        </h2>
        <p className="text-sm text-muted-foreground">
          Owners and pharmacists are required to enable this. It&apos;s optional for counter
          staff, but recommended.
        </p>
      </div>
      <MfaSetupForm onDone={() => window.location.reload()} />
      {totpEnabled === false && (
        <p className="text-xs text-muted-foreground">
          Scan the QR code above with an authenticator app to turn this on.
        </p>
      )}
    </div>
  );
}
