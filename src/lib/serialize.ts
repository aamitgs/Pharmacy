import type { Item, Batch } from "@prisma/client";

// Prisma's Decimal is a class instance, not a plain object — it doesn't
// survive the React Server Component serialization boundary (props passed
// to Client Components, and server action return values). Every read path
// that hands Item/Batch rows to client code must convert Decimal fields to
// plain numbers first, or money math downstream silently gets NaN/garbage.

export type PlainItem = Omit<Item, "taxRate"> & { taxRate: number };
export type PlainBatch = Omit<Batch, "mrp" | "purchaseRate" | "saleRate"> & {
  mrp: number;
  purchaseRate: number;
  saleRate: number;
};

export function serializeItem(item: Item): PlainItem {
  return { ...item, taxRate: Number(item.taxRate) };
}

export function serializeBatch(batch: Batch): PlainBatch {
  return {
    ...batch,
    mrp: Number(batch.mrp),
    purchaseRate: Number(batch.purchaseRate),
    saleRate: Number(batch.saleRate),
  };
}
