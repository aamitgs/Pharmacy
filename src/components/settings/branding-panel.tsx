"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateBranding, setCustomDomain, verifyCustomDomain, clearCustomDomain } from "@/lib/actions/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Lock } from "lucide-react";

interface BrandingInfo {
  pharmacyName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  invoiceFooterText: string | null;
  customDomain: string | null;
  customDomainVerificationToken: string | null;
  customDomainVerifiedAt: Date | null;
  whiteLabelPlan: boolean;
}

export function BrandingPanel({ initial }: { initial: BrandingInfo }) {
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor ?? "#1e3a8a");
  const [footerText, setFooterText] = useState(initial.invoiceFooterText ?? "");
  const [pending, startTransition] = useTransition();

  const [domain, setDomain] = useState(initial.customDomain ?? "");
  const [domainState, setDomainState] = useState({
    verificationToken: initial.customDomainVerificationToken,
    verifiedAt: initial.customDomainVerifiedAt,
  });
  const [domainPending, startDomainTransition] = useTransition();

  function saveBranding() {
    startTransition(async () => {
      try {
        await updateBranding({ logoUrl, primaryColor, invoiceFooterText: footerText });
        toast.success("Branding saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  function saveDomain() {
    startDomainTransition(async () => {
      try {
        const result = await setCustomDomain(domain);
        setDomainState({ verificationToken: result.verificationToken, verifiedAt: null });
        toast.success("Domain saved — add the TXT record below, then verify.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save domain");
      }
    });
  }

  function verify() {
    startDomainTransition(async () => {
      try {
        const result = await verifyCustomDomain();
        if (result.verified) {
          setDomainState((s) => ({ ...s, verifiedAt: new Date() }));
          toast.success("Domain verified");
        } else {
          toast.error(result.note ?? "Not verified yet");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Verification failed");
      }
    });
  }

  function removeDomain() {
    startDomainTransition(async () => {
      try {
        await clearCustomDomain();
        setDomain("");
        setDomainState({ verificationToken: null, verifiedAt: null });
        toast.success("Domain removed");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not remove domain");
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="logoUrl">Logo URL</Label>
            <Input id="logoUrl" placeholder="https://..." value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="primaryColor">Primary color</Label>
            <div className="flex items-center gap-2">
              <input
                id="primaryColor"
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-9 w-12 rounded border"
              />
              <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-32" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="footerText">Receipt footer text</Label>
            <Textarea
              id="footerText"
              rows={3}
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Thank you for visiting. Medicines once sold are not returnable."
            />
          </div>
          <Button onClick={saveBranding} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save branding
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label>Live preview</Label>
          <div className="rounded-lg border bg-white p-3 font-mono text-[11px] text-black">
            <div className="text-center">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="mx-auto mb-1 h-10 max-w-[60%] object-contain" onError={(e) => (e.currentTarget.style.display = "none")} />
              )}
              <div className="text-sm font-bold" style={{ color: primaryColor }}>
                {initial.pharmacyName}
              </div>
              <div className="text-[10px]">Main Branch</div>
            </div>
            <div className="my-1.5 border-t border-dashed border-black/40" />
            <div className="flex justify-between">
              <span>Item</span>
              <span>Amt</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Paracetamol 500mg</span>
              <span>28.00</span>
            </div>
            <div className="my-1.5 border-t border-dashed border-black/40" />
            {footerText && <div className="text-center text-[10px]">{footerText}</div>}
            {!initial.whiteLabelPlan && (
              <div className="mt-1 text-center text-[9px] text-neutral-500">Powered by Pharmacy Billing</div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <Label>Custom domain</Label>
        {!initial.whiteLabelPlan ? (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Custom domains require the Premium plan or above — upgrade in Settings &gt; Billing.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder="billing.yourpharmacy.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="max-w-xs"
              />
              <Button size="sm" variant="outline" disabled={domainPending} onClick={saveDomain}>
                Save domain
              </Button>
              {domain && (
                <Button size="sm" variant="ghost" disabled={domainPending} onClick={removeDomain}>
                  Remove
                </Button>
              )}
            </div>
            {domainState.verificationToken && !domainState.verifiedAt && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
                <p>Add this TXT record at your DNS provider, then verify:</p>
                <code className="block break-all rounded bg-background p-2">
                  _pharmacy-verify.{domain} TXT {domainState.verificationToken}
                </code>
                <Button size="sm" disabled={domainPending} onClick={verify}>
                  {domainPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Verify now
                </Button>
              </div>
            )}
            {domainState.verifiedAt && (
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="h-3 w-3 text-success" /> Verified
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
