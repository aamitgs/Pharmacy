"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ReceiptView } from "./receipt-view";
import { SendWhatsAppButton } from "@/components/whatsapp/send-whatsapp-button";
import { sendReceiptWhatsApp } from "@/lib/actions/whatsapp";
import type { ReceiptData } from "@/lib/actions/invoices";
import { ChevronLeft, Printer, FileImage } from "lucide-react";
import { format } from "date-fns";

type PaperSize = "58mm" | "80mm" | "a4";

const PAPER_CONFIG: Record<PaperSize, { label: string; width: string; pageSize: string }> = {
  "58mm": { label: "58mm thermal", width: "58mm", pageSize: "58mm auto" },
  "80mm": { label: "80mm thermal", width: "80mm", pageSize: "80mm auto" },
  a4: { label: "A4 / PDF", width: "210mm", pageSize: "A4" },
};

export function ReceiptPageClient({ data }: { data: ReceiptData }) {
  const [paperSize, setPaperSize] = useState<PaperSize>("80mm");
  const config = PAPER_CONFIG[paperSize];

  return (
    <div className="p-6">
      <style>{`@page { size: ${config.pageSize}; margin: ${
        paperSize === "a4" ? "12mm" : "0"
      }; }`}</style>

      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href="/pos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to billing
        </Link>
        <div className="flex items-center gap-2">
          {data.prescriptionImageUrl && (
            <Button asChild size="sm" variant="outline">
              <a
                href={`/api/files/prescriptions/${data.prescriptionImageUrl}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileImage className="h-4 w-4" /> Prescription
              </a>
            </Button>
          )}
          <div className="flex overflow-hidden rounded-md border">
            {(Object.keys(PAPER_CONFIG) as PaperSize[]).map((size) => (
              <button
                key={size}
                onClick={() => setPaperSize(size)}
                className={`px-2.5 py-1 text-xs ${
                  paperSize === size ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {PAPER_CONFIG[size].label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <SendWhatsAppButton
            defaultPhone={data.customer?.phone ?? null}
            onSend={(phone) => sendReceiptWhatsApp(data.id, phone)}
          />
        </div>
      </div>

      {data.pharmacistSignoff && (
        <p className="mb-2 text-center text-xs text-muted-foreground print:hidden">
          Signed off by {data.pharmacistSignoff.name}
          {data.pharmacistSignoff.at ? ` · ${format(new Date(data.pharmacistSignoff.at), "dd MMM yyyy, h:mm a")}` : ""}
        </p>
      )}

      <div
        className="mx-auto border shadow-sm print:border-0 print:shadow-none"
        style={{ width: config.width }}
      >
        <ReceiptView data={data} />
      </div>
    </div>
  );
}
