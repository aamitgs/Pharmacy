import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getInvoiceForReturn } from "@/lib/actions/credit-notes";
import { CreditNoteForm } from "@/components/credit-notes/credit-note-form";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CREDIT_NOTE_ROLES } from "@/lib/credit-note";
import { AlertCircle, ChevronLeft } from "lucide-react";
import { format } from "date-fns";

export default async function InvoiceReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return null;
  if (!(CREDIT_NOTE_ROLES as readonly string[]).includes(session.user.role)) {
    return <RestrictedAccess />;
  }

  const { id } = await params;
  const data = await getInvoiceForReturn(id);
  if (!data) notFound();

  return (
    <div className="space-y-4 p-6">
      <Link
        href={`/invoices/${data.invoiceId}/receipt`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back to {data.invoiceNo}
      </Link>

      <div>
        <h1 className="text-lg font-semibold">Customer return · {data.invoiceNo}</h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(data.invoiceDate), "dd MMM yyyy, h:mm a")} ·{" "}
          {data.customer?.name ?? "Walk-in"} · raises a GST credit note against this invoice
        </p>
      </div>

      {data.eligibility.allowed ? (
        <CreditNoteForm
          invoiceId={data.invoiceId}
          invoiceNo={data.invoiceNo}
          hasCustomer={!!data.customer}
          lines={data.lines}
        />
      ) : (
        <Alert variant="destructive" className="max-w-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{data.eligibility.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
