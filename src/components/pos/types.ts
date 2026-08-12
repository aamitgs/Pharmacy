import type { PlainItem, PlainBatch } from "@/lib/serialize";

export type PosItem = PlainItem & { batches: PlainBatch[] };

export interface PosCustomer {
  id: string;
  name: string;
  phone: string | null;
  creditLimit: number | null;
  outstandingBalance: number;
}

export interface PosDoctor {
  id: string;
  name: string;
  registrationNo: string | null;
  clinicName: string | null;
}
