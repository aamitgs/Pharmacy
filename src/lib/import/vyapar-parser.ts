import type { ImportFieldKey } from "./fields";
import type { NormalizedRow } from "./normalize";
import { findColumn } from "./column-match";
import { parseIndianDayFirstDate } from "./date-parse";

// Column aliases seen across Vyapar's item/stock CSV exports (a general
// small-business billing app — batch/expiry tracking is an add-on feature
// there, so those columns are less standardized than Marg's). Feeds the
// same NormalizedRow shape the generic column-mapping UI produces, so it
// drops straight into the existing validate -> preview -> commit pipeline
// (see fields.ts) without any changes there.
const VYAPAR_COLUMNS: Record<string, string[]> = {
  name: ["item name", "itemname", "product name"],
  hsnCode: ["hsn code", "hsn/sac code", "hsn"],
  taxRate: ["tax rate", "tax rate(%)", "gst rate", "gst%"],
  unit: ["unit", "base unit", "measuring unit"],
  reorderLevel: ["min stock quantity", "minimum stock", "reorder level"],
  batchNo: ["batch no", "batch no.", "batch number"],
  mfgDate: ["mfg date", "manufacturing date"],
  expiryDate: ["expiry date", "exp date"],
  mrp: ["mrp", "retail price"],
  purchaseRate: ["purchase price", "purchase price(with tax)", "cost price"],
  saleRate: ["sale price", "sales price", "selling price", "sale price(with tax)"],
  currentQty: ["opening quantity", "stock quantity", "current stock", "closing quantity"],
};

export function parseVyaparCsv(rows: Record<string, string>[]): NormalizedRow[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const resolved = Object.fromEntries(
    Object.entries(VYAPAR_COLUMNS).map(([field, aliases]) => [field, findColumn(headers, aliases)])
  ) as Record<keyof typeof VYAPAR_COLUMNS, string | undefined>;

  return rows.map((row, index) => {
    const normalized: NormalizedRow = { _rowIndex: index };
    for (const [field, column] of Object.entries(resolved)) {
      if (!column) continue;
      const value = row[column]?.trim();
      if (!value) continue;
      if (field === "mfgDate" || field === "expiryDate") {
        // Never handed to new Date() directly — an ambiguous day-first
        // string like "05/08/2026" would silently parse as May 8th
        // instead of erroring. Unrecognized formats pass through
        // unchanged so validateRows flags them instead of guessing.
        normalized[field as ImportFieldKey] = parseIndianDayFirstDate(value) ?? value;
      } else {
        normalized[field as ImportFieldKey] = value;
      }
    }
    return normalized;
  });
}
