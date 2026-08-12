import { notFound } from "next/navigation";
import { getInvoiceForReceipt } from "@/lib/actions/invoices";
import { ReceiptPageClient } from "@/components/receipt/receipt-page-client";

export default async function ReceiptPage({ params }: { params: { id: string } }) {
  const data = await getInvoiceForReceipt(params.id);
  if (!data) notFound();

  return <ReceiptPageClient data={data} />;
}
