import { create } from "zustand";
import type { ScheduleClass, PaymentMode } from "@prisma/client";

export interface CartLine {
  lineId: string;
  itemId: string;
  itemName: string;
  genericName: string | null;
  manufacturer: string | null;
  scheduleClass: ScheduleClass;
  taxRate: number;
  batchId: string;
  batchNo: string;
  expiryDate: string;
  availableQty: number;
  rate: number;
  qty: number;
  discountPercent: number;
}

interface RemovedLine {
  line: CartLine;
  index: number;
}

interface CartState {
  lines: CartLine[];
  billDiscount: { isPercent: boolean; value: number };
  customerId: string | null;
  doctorId: string | null;
  patientName: string;
  patientAge: string;
  paymentMode: PaymentMode;
  lastRemoved: RemovedLine | null;
  focusLineId: string | null;

  addLine: (line: Omit<CartLine, "lineId" | "qty" | "discountPercent">) => string;
  updateQty: (lineId: string, qty: number) => void;
  setLineDiscount: (lineId: string, percent: number) => void;
  overrideBatch: (
    lineId: string,
    batch: { batchId: string; batchNo: string; expiryDate: string; availableQty: number; rate: number }
  ) => void;
  removeLine: (lineId: string) => void;
  undoRemove: () => void;
  clearFocusLine: () => void;
  setBillDiscount: (d: { isPercent: boolean; value: number }) => void;
  setCustomer: (id: string | null) => void;
  setDoctor: (id: string | null) => void;
  setPatientName: (v: string) => void;
  setPatientAge: (v: string) => void;
  setPaymentMode: (mode: PaymentMode) => void;
  reset: () => void;
}

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `line-${Date.now()}-${idCounter}`;
}

const initialState = {
  lines: [] as CartLine[],
  billDiscount: { isPercent: true, value: 0 },
  customerId: null as string | null,
  doctorId: null as string | null,
  patientName: "",
  patientAge: "",
  paymentMode: "cash" as PaymentMode,
  lastRemoved: null as RemovedLine | null,
  focusLineId: null as string | null,
};

export const useCartStore = create<CartState>((set, get) => ({
  ...initialState,

  addLine: (line) => {
    const existing = get().lines.find(
      (l) => l.itemId === line.itemId && l.batchId === line.batchId
    );
    if (existing) {
      set({
        lines: get().lines.map((l) =>
          l.lineId === existing.lineId ? { ...l, qty: l.qty + 1 } : l
        ),
        focusLineId: existing.lineId,
      });
      return existing.lineId;
    }
    const lineId = nextId();
    set({
      lines: [...get().lines, { ...line, lineId, qty: 1, discountPercent: 0 }],
      focusLineId: lineId,
    });
    return lineId;
  },

  updateQty: (lineId, qty) => {
    set({
      lines: get().lines.map((l) =>
        l.lineId === lineId ? { ...l, qty: Math.max(1, Math.min(qty, l.availableQty)) } : l
      ),
    });
  },

  setLineDiscount: (lineId, percent) => {
    set({
      lines: get().lines.map((l) =>
        l.lineId === lineId
          ? { ...l, discountPercent: Math.max(0, Math.min(100, percent)) }
          : l
      ),
    });
  },

  overrideBatch: (lineId, batch) => {
    set({
      lines: get().lines.map((l) =>
        l.lineId === lineId
          ? {
              ...l,
              batchId: batch.batchId,
              batchNo: batch.batchNo,
              expiryDate: batch.expiryDate,
              availableQty: batch.availableQty,
              rate: batch.rate,
              qty: Math.min(l.qty, batch.availableQty),
            }
          : l
      ),
    });
  },

  removeLine: (lineId) => {
    const lines = get().lines;
    const index = lines.findIndex((l) => l.lineId === lineId);
    if (index === -1) return;
    const line = lines[index];
    set({
      lines: lines.filter((l) => l.lineId !== lineId),
      lastRemoved: { line, index },
    });
  },

  undoRemove: () => {
    const removed = get().lastRemoved;
    if (!removed) return;
    const lines = [...get().lines];
    lines.splice(removed.index, 0, removed.line);
    set({ lines, lastRemoved: null });
  },

  clearFocusLine: () => set({ focusLineId: null }),

  setBillDiscount: (d) => set({ billDiscount: d }),
  setCustomer: (id) => set({ customerId: id }),
  setDoctor: (id) => set({ doctorId: id }),
  setPatientName: (v) => set({ patientName: v }),
  setPatientAge: (v) => set({ patientAge: v }),
  setPaymentMode: (mode) => set({ paymentMode: mode }),

  reset: () => set({ ...initialState, lines: [] }),
}));
