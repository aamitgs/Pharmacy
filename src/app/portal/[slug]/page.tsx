import { redirect } from "next/navigation";
import Link from "next/link";
import { getPortalSession, getPortalCustomer } from "@/lib/actions/customer-portal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { History, Award } from "lucide-react";

export default async function PortalHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getPortalSession(slug);
  if (!session) redirect(`/portal/${slug}/login`);

  const customer = await getPortalCustomer(slug);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Hi, {customer.name}</h1>
        {customer.loyaltyTierName && (
          <p className="text-sm text-muted-foreground">
            {customer.loyaltyTierName} tier · {customer.loyaltyDiscountPercent}% loyalty discount
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href={`/portal/${slug}/history`}>
          <Card className="transition-colors hover:bg-muted/40">
            <CardHeader className="items-center pb-2 text-center">
              <History className="h-6 w-6 text-muted-foreground" />
              <CardTitle className="text-sm">Purchase History</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-xs text-muted-foreground">
              Past orders &amp; receipts
            </CardContent>
          </Card>
        </Link>
        <Link href={`/portal/${slug}/loyalty`}>
          <Card className="transition-colors hover:bg-muted/40">
            <CardHeader className="items-center pb-2 text-center">
              <Award className="h-6 w-6 text-muted-foreground" />
              <CardTitle className="text-sm">Loyalty Status</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-xs text-muted-foreground">
              Tier &amp; savings
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
