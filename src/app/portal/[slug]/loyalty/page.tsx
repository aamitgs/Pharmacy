import { redirect } from "next/navigation";
import { getPortalSession, getPortalLoyaltyStatus } from "@/lib/actions/customer-portal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PortalLoyaltyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getPortalSession(slug);
  if (!session) redirect(`/portal/${slug}/login`);

  const status = await getPortalLoyaltyStatus(slug);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-lg font-semibold">Loyalty Status</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {status.currentTierName ?? "No tier yet"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Lifetime spend: ₹{status.cumulativeSpend.toFixed(2)}</p>
          {status.currentDiscountPercent > 0 && (
            <p>Current discount: {status.currentDiscountPercent}% on every bill</p>
          )}
          {status.nextTierName && status.amountToNextTier !== null && (
            <p>
              Spend ₹{status.amountToNextTier.toFixed(2)} more to reach{" "}
              <span className="font-medium text-foreground">{status.nextTierName}</span>
            </p>
          )}
          {!status.nextTierName && status.currentTierName && (
            <p>You&apos;re at the highest tier. Thank you for your loyalty!</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
