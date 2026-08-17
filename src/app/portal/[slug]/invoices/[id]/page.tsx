import { redirect, notFound } from "next/navigation";
import { format } from "date-fns";
import { getPortalSession, getPortalInvoice } from "@/lib/actions/customer-portal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PortalRefillRequestForm } from "@/components/portal/portal-refill-request-form";

export default async function PortalInvoicePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const session = await getPortalSession(slug);
  if (!session) redirect(`/portal/${slug}/login`);

  const invoice = await getPortalInvoice(slug, id);
  if (!invoice) notFound();

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{invoice.invoiceNo}</h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(invoice.invoiceDate), "dd MMM yyyy, HH:mm")} · {invoice.branchName}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-4">
          {invoice.items.map((line, i) => (
            <div key={i} className="flex justify-between text-sm">
              <div>
                <div>{line.itemName}</div>
                <div className="text-xs text-muted-foreground">
                  {line.qty} {line.unit} × ₹{line.rate.toFixed(2)}
                </div>
              </div>
              <div className="tabular-nums">₹{line.lineTotal.toFixed(2)}</div>
            </div>
          ))}
          <Separator className="my-2" />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">₹{invoice.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Discount</span>
            <span className="tabular-nums">−₹{invoice.discountAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Tax</span>
            <span className="tabular-nums">₹{invoice.taxAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">₹{invoice.total.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Need this again?</CardTitle>
        </CardHeader>
        <CardContent>
          <PortalRefillRequestForm slug={slug} invoiceId={invoice.id} />
        </CardContent>
      </Card>
    </div>
  );
}
