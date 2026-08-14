"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { createUpgradeCheckout } from "@/lib/actions/subscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Info, Loader2 } from "lucide-react";

interface PlanSummary {
  code: string;
  name: string;
  priceMonthly: number;
  maxBranches: number | null;
  maxUsers: number | null;
  whiteLabel: boolean;
  publicApiAccess: boolean;
  contactSalesOnly: boolean;
}

interface BillingInfo {
  subscription: {
    planCode: string;
    planName: string;
    status: string;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
  } | null;
  plans: PlanSummary[];
  usage: { branchCount: number; userCount: number };
  razorpayConfigured: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Payment due",
  cancelled: "Cancelled",
};

export function BillingPanel({ initial }: { initial: BillingInfo }) {
  const [pending, startTransition] = useTransition();
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

  function upgrade(planCode: string) {
    setPendingPlan(planCode);
    startTransition(async () => {
      try {
        const result = await createUpgradeCheckout(planCode);
        if (!result.ok) {
          toast.error(result.note ?? "Could not start checkout");
          return;
        }
        toast.success("Checkout started — complete payment in the Razorpay window.");
        // Razorpay's Checkout.js widget (loaded separately) would open here
        // using result.razorpaySubscriptionId; the actual plan switch is
        // applied by the webhook once payment is confirmed.
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not start checkout");
      } finally {
        setPendingPlan(null);
      }
    });
  }

  const current = initial.subscription;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-sm font-medium">Current plan</h2>
        {current ? (
          <div className="mt-2 flex items-center gap-3">
            <Badge variant={current.status === "past_due" ? "destructive" : "default"}>
              {current.planName}
            </Badge>
            <span className="text-sm text-muted-foreground">{STATUS_LABEL[current.status] ?? current.status}</span>
            {current.status === "trialing" && current.trialEndsAt && (
              <span className="text-sm text-muted-foreground">
                · trial ends {format(current.trialEndsAt, "dd MMM yyyy")}
              </span>
            )}
            {current.status === "active" && current.currentPeriodEnd && (
              <span className="text-sm text-muted-foreground">
                · renews {format(current.currentPeriodEnd, "dd MMM yyyy")}
              </span>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No subscription on file.</p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          {initial.usage.branchCount} branch{initial.usage.branchCount === 1 ? "" : "es"} ·{" "}
          {initial.usage.userCount} user{initial.usage.userCount === 1 ? "" : "s"} in use.
        </p>
      </div>

      {!initial.razorpayConfigured && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Razorpay isn&apos;t configured on this deployment yet — plan upgrades are shown below
            but checkout will report &quot;not configured&quot; until an operator sets
            RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (see README).
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Plans</h2>
        {initial.plans.map((plan) => {
          const isCurrent = current?.planCode === plan.code;
          return (
            <Card key={plan.code}>
              <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    {plan.name}
                    {isCurrent && <Badge variant="outline">Current</Badge>}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {plan.contactSalesOnly
                      ? "Custom pricing"
                      : plan.priceMonthly === 0
                        ? "Free"
                        : `₹${plan.priceMonthly.toFixed(0)}/month`}
                    {" · "}
                    {plan.maxBranches ? `${plan.maxBranches} branch${plan.maxBranches === 1 ? "" : "es"}` : "Unlimited branches"}
                    {" · "}
                    {plan.maxUsers ? `${plan.maxUsers} users` : "Unlimited users"}
                    {plan.whiteLabel && " · White-labeling"}
                    {plan.publicApiAccess && " · API access"}
                  </CardDescription>
                </div>
                {isCurrent ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : plan.contactSalesOnly ? (
                  <Button size="sm" variant="outline" asChild>
                    <a href="mailto:sales@example.com?subject=Enterprise%20plan%20inquiry">Talk to sales</a>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending && pendingPlan === plan.code}
                    onClick={() => upgrade(plan.code)}
                  >
                    {pending && pendingPlan === plan.code && <Loader2 className="h-4 w-4 animate-spin" />}
                    {plan.code === "trial" ? "Downgrade" : "Upgrade"}
                  </Button>
                )}
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
