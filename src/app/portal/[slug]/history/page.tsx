import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { getPortalSession, listPortalPurchaseHistory } from "@/lib/actions/customer-portal";
import { Card, CardContent } from "@/components/ui/card";

export default async function PortalHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getPortalSession(slug);
  if (!session) redirect(`/portal/${slug}/login`);

  const invoices = await listPortalPurchaseHistory(slug);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-lg font-semibold">Purchase History</h1>
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No past orders yet.</p>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <Link key={inv.id} href={`/portal/${slug}/invoices/${inv.id}`}>
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium">{inv.invoiceNo}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(inv.invoiceDate), "dd MMM yyyy")} · {inv.branchName} ·{" "}
                      {inv.itemCount} item{inv.itemCount === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">₹{inv.total.toFixed(2)}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
