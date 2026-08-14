import type { ImportFieldKey } from "./fields";
import type { NormalizedRow } from "./normalize";
import { findColumn } from "./column-match";
import { normalizeExpiryDate, parseIndianDayFirstDate } from "./date-parse";

// Column aliases seen across Marg ERP's various stock/item-master CSV
// export options (Marg's exact header text varies by module/version — this
// covers the common ones). Feeds the same NormalizedRow shape the generic
// column-mapping UI produces, so it drops straight into the existing
// validate -> preview -> commit pipeline (see fields.ts) without any
// changes there.
const MARG_COLUMNS: Record<string, string[]> = {
  name: ["item name", "itemname", "product name", "description"],
  genericName: ["generic name", "salt", "composition name"],
  manufacturer: ["company", "company name", "manufacturer"],
  composition: ["composition", "content"],
  hsnCode: ["hsn", "hsn code", "hsn/sac"],
  taxRate: ["gst", "gst%", "gst rate", "tax", "tax%"],
  unit: ["unit", "uom", "u.o.m."],
  packSize: ["pack", "packing", "pack size"],
  reorderLevel: ["reorder level", "reorder qty", "min stock", "min qty"],
  batchNo: ["batch", "batch no", "batch no.", "batchno"],
  mfgDate: ["mfg date", "mfg dt", "manufacturing date"],
  expiryDate: ["expiry", "exp date", "exp dt", "expiry date", "expdate"],
  mrp: ["mrp", "m.r.p."],
  purchaseRate: ["purchase rate", "prate", "p.rate", "cost", "cost price"],
  saleRate: ["sales rate", "sale rate", "srate", "s.rate", "selling price"],
  currentQty: ["stock", "qty", "quantity", "closing stock", "current stock"],
  rackLocation: ["rack", "rack no", "location"],
};

export function parseMargCsv(rows: Record<string, string>[]): NormalizedRow[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const resolved = Object.fromEntries(
    Object.entries(MARG_COLUMNS).map(([field, aliases]) => [field, findColumn(headers, aliases)])
  ) as Record<keyof typeof MARG_COLUMNS, string | undefined>;

  return rows.map((row, index) => {
    const normalized: NormalizedRow = { _rowIndex: index };
    for (const [field, column] of Object.entries(resolved)) {
      if (!column) continue;
      const value = row[column]?.trim();
      if (!value) continue;
      if (field === "mfgDate") {
        normalized.mfgDate = parseIndianDayFirstDate(value) ?? value;
      } else if (field === "expiryDate") {
        // Marg batches are commonly expiry-dated by month/year only —
        // normalizeExpiryDate handles both that and full dates, and passes
        // through unrecognized formats unchanged so they're flagged by
        // validateRows rather than silently guessed.
        normalized.expiryDate = normalizeExpiryDate(value);
      } else {
        normalized[field as ImportFieldKey] = value;
      }
    }
    return normalized;
  });
}
