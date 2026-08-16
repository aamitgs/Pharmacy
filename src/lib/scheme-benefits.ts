import type { SchemeBenefitRow } from "@/lib/actions/reports";

export interface SchemeBenefitSummary {
  label: string;
  freeGoodsValue: number;
  cashDiscountValue: number;
  totalBenefit: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function summarize(rows: SchemeBenefitRow[], keyOf: (r: SchemeBenefitRow) => string): SchemeBenefitSummary[] {
  const byKey = new Map<string, { freeGoodsValue: number; cashDiscountValue: number }>();
  for (const r of rows) {
    const key = keyOf(r);
    const entry = byKey.get(key) ?? { freeGoodsValue: 0, cashDiscountValue: 0 };
    entry.freeGoodsValue += r.freeGoodsValue;
    entry.cashDiscountValue += r.cashDiscountValue;
    byKey.set(key, entry);
  }
  return Array.from(byKey.entries())
    .map(([label, v]) => ({
      label,
      freeGoodsValue: round2(v.freeGoodsValue),
      cashDiscountValue: round2(v.cashDiscountValue),
      totalBenefit: round2(v.freeGoodsValue + v.cashDiscountValue),
    }))
    .sort((a, b) => b.totalBenefit - a.totalBenefit);
}

export function summarizeSchemeBenefitsBySupplier(rows: SchemeBenefitRow[]): SchemeBenefitSummary[] {
  return summarize(rows, (r) => r.supplierName);
}

export function summarizeSchemeBenefitsByManufacturer(rows: SchemeBenefitRow[]): SchemeBenefitSummary[] {
  return summarize(rows, (r) => r.manufacturer);
}
