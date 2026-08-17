import { format } from "date-fns";

/**
 * Tally's "Import Data > Vouchers" XML format. Structure, tag names, date
 * format (YYYYMMDD), and the ISDEEMEDPOSITIVE/AMOUNT sign convention below
 * are Tally's own documented request/response schema for voucher import,
 * not something this app invented — cross-checked against Tally's XML
 * developer documentation and multiple independent integration references.
 * Re-verify against a real Tally instance before relying on this for actual
 * bookkeeping (see the README caveat, same as every other unverified
 * external-integration in this app).
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function tallyDate(d: Date): string {
  return format(d, "yyyyMMdd");
}

export interface TallyLedgerEntry {
  ledgerName: string;
  /** true = this ledger is debited (Tally's ISDEEMEDPOSITIVE=Yes, amount written negative); false = credited. */
  isDebit: boolean;
  /** Always a positive number — the sign in the generated XML is derived from isDebit. */
  amount: number;
}

export interface TallyVoucher {
  vchType: "Sales" | "Purchase" | "Receipt" | "Payment";
  date: Date;
  voucherNumber: string;
  partyLedgerName: string;
  narration?: string;
  /** Must sum to zero once each entry's sign is applied — callers should add a "Round Off" entry for any residual before calling this. */
  entries: TallyLedgerEntry[];
}

function buildLedgerEntryXml(entry: TallyLedgerEntry): string {
  const signedAmount = entry.isDebit ? -entry.amount : entry.amount;
  return [
    "<ALLLEDGERENTRIES.LIST>",
    `<LEDGERNAME>${escapeXml(entry.ledgerName)}</LEDGERNAME>`,
    `<ISDEEMEDPOSITIVE>${entry.isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    `<AMOUNT>${signedAmount.toFixed(2)}</AMOUNT>`,
    "</ALLLEDGERENTRIES.LIST>",
  ].join("");
}

function buildVoucherXml(v: TallyVoucher): string {
  const isInvoiceType = v.vchType === "Sales" || v.vchType === "Purchase";
  return [
    `<VOUCHER VCHTYPE="${escapeXml(v.vchType)}" ACTION="Create">`,
    `<DATE>${tallyDate(v.date)}</DATE>`,
    `<VOUCHERTYPENAME>${escapeXml(v.vchType)}</VOUCHERTYPENAME>`,
    `<VOUCHERNUMBER>${escapeXml(v.voucherNumber)}</VOUCHERNUMBER>`,
    `<PARTYLEDGERNAME>${escapeXml(v.partyLedgerName)}</PARTYLEDGERNAME>`,
    isInvoiceType ? "<ISINVOICE>Yes</ISINVOICE>" : "",
    v.narration ? `<NARRATION>${escapeXml(v.narration)}</NARRATION>` : "",
    ...v.entries.map(buildLedgerEntryXml),
    "</VOUCHER>",
  ]
    .filter(Boolean)
    .join("");
}

/** Wraps every voucher in the ENVELOPE/HEADER/BODY/IMPORTDATA structure Tally's importer expects for a single "Vouchers" request. */
export function buildTallyImportXml(pharmacyName: string, vouchers: TallyVoucher[]): string {
  const messages = vouchers.map((v) => `<TALLYMESSAGE xmlns:UDF="TallyUDF">${buildVoucherXml(v)}</TALLYMESSAGE>`).join("");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<ENVELOPE>",
    "<HEADER>",
    "<TALLYREQUEST>Import Data</TALLYREQUEST>",
    "</HEADER>",
    "<BODY>",
    "<IMPORTDATA>",
    "<REQUESTDESC>",
    "<REPORTNAME>Vouchers</REPORTNAME>",
    "<STATICVARIABLES>",
    `<SVCURRENTCOMPANY>${escapeXml(pharmacyName)}</SVCURRENTCOMPANY>`,
    "</STATICVARIABLES>",
    "</REQUESTDESC>",
    `<REQUESTDATA>${messages}</REQUESTDATA>`,
    "</IMPORTDATA>",
    "</BODY>",
    "</ENVELOPE>",
  ].join("");
}
