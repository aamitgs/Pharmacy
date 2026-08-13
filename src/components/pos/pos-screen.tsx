"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { UserRole } from "@/generated/prisma/client";
import { useCartStore } from "@/store/cart-store";
import { computeBilling, effectiveDiscountPercent, type BillingLineInput } from "@/lib/billing";
import { completeSale, verifyManagerPin, verifyPharmacistCredentials } from "@/lib/actions/pos";
import { SearchPanel } from "./search-panel";
import { CartTable } from "./cart-table";
import { BottomBar } from "./bottom-bar";
import { PrescriptionFields } from "./prescription-fields";
import { PrescriptionUpload } from "./prescription-upload";
import { ManagerPinDialog } from "./manager-pin-dialog";
import { PharmacistSignoffDialog } from "./pharmacist-signoff-dialog";
import type { PosItem, PosCustomer, PosDoctor } from "./types";

const SELF_SIGNOFF_ROLES = new Set(["pharmacist", "owner"]);

const REQUIRES_PRESCRIPTION = new Set(["H", "H1", "X"]);

type PendingDiscount =
  | { kind: "line"; lineId: string; percent: number }
  | { kind: "bill"; value: number; isPercent: boolean };

export function PosScreen({
  items,
  customers,
  doctors,
  branchId,
  staffDiscountCapPercent,
  role,
}: {
  items: PosItem[];
  customers: PosCustomer[];
  doctors: PosDoctor[];
  branchId: string | null;
  staffDiscountCapPercent: number;
  role: UserRole;
}) {
  const router = useRouter();
  const store = useCartStore();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [doctorList, setDoctorList] = useState(doctors);
  const [submitting, setSubmitting] = useState(false);
  const [pinDialog, setPinDialog] = useState<{
    open: boolean;
    pending: PendingDiscount | null;
    error: string | null;
    forFinalSubmit: boolean;
  }>({ open: false, pending: null, error: null, forFinalSubmit: false });
  const pinVerifiedRef = useRef(false);
  const managerPinRef = useRef<string | undefined>(undefined);
  const [signoffDialog, setSignoffDialog] = useState<{
    open: boolean;
    error: string | null;
    submitting: boolean;
  }>({ open: false, error: null, submitting: false });
  const pharmacistReauthRef = useRef<{ email: string; password: string } | undefined>(undefined);

  const catalogByItemId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const billing = useMemo(() => {
    const lineInputs: BillingLineInput[] = store.lines.map((l) => ({
      lineId: l.lineId,
      qty: l.qty,
      rate: l.rate,
      taxRate: l.taxRate,
      discountPercent: l.discountPercent,
    }));
    return computeBilling(lineInputs, store.billDiscount);
  }, [store.lines, store.billDiscount]);

  const needsPrescription = store.lines.some((l) => REQUIRES_PRESCRIPTION.has(l.scheduleClass));

  const blockedReason = useMemo(() => {
    if (store.lines.length === 0) return "Add at least one item to the cart.";
    if (needsPrescription && (!store.doctorId || !store.patientName.trim())) {
      return "Select a doctor and enter the patient name for prescription items.";
    }
    if (store.paymentMode === "credit") {
      const customer = customers.find((c) => c.id === store.customerId);
      if (!customer || customer.creditLimit === null) {
        return "Select a customer with a credit account for credit sales.";
      }
    }
    if (!branchId) return "No branch configured for this pharmacy yet.";
    return null;
  }, [store.lines, needsPrescription, store.doctorId, store.patientName, store.paymentMode, store.customerId, customers, branchId]);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
  }, []);

  function handleAddItem(item: PosItem) {
    const fefo = item.batches[0];
    if (!fefo) {
      toast.error(`${item.name} has no stock available.`);
      return;
    }
    store.addLine({
      itemId: item.id,
      itemName: item.name,
      genericName: item.genericName,
      manufacturer: item.manufacturer,
      scheduleClass: item.scheduleClass,
      taxRate: item.taxRate,
      batchId: fefo.id,
      batchNo: fefo.batchNo,
      expiryDate: fefo.expiryDate.toISOString(),
      availableQty: fefo.currentQty,
      rate: fefo.saleRate,
    });
  }

  function requestPinIfNeeded(pending: PendingDiscount, effectivePercent: number, apply: () => void) {
    if (role !== "counter_staff" || effectivePercent <= staffDiscountCapPercent || pinVerifiedRef.current) {
      apply();
      return;
    }
    setPinDialog({ open: true, pending, error: null, forFinalSubmit: false });
  }

  function handleLineDiscountChange(lineId: string, percent: number) {
    const clamped = Math.max(0, Math.min(100, percent));
    requestPinIfNeeded({ kind: "line", lineId, percent: clamped }, clamped, () =>
      store.setLineDiscount(lineId, clamped)
    );
  }

  function handleBillDiscountChange(value: number, isPercent: boolean) {
    const clamped = Math.max(0, value);
    const effective = effectiveDiscountPercent({ isPercent, value: clamped }, billing.subtotal);
    requestPinIfNeeded({ kind: "bill", value: clamped, isPercent }, effective, () =>
      store.setBillDiscount({ isPercent, value: clamped })
    );
  }

  async function handlePinSubmit(pin: string) {
    const valid = await verifyManagerPin(pin);
    if (!valid) {
      setPinDialog((d) => ({ ...d, error: "Incorrect PIN. Try again." }));
      return;
    }
    pinVerifiedRef.current = true;
    managerPinRef.current = pin;

    if (pinDialog.forFinalSubmit) {
      setPinDialog({ open: false, pending: null, error: null, forFinalSubmit: false });
      void submitSale();
      return;
    }

    const pending = pinDialog.pending;
    if (pending?.kind === "line") {
      store.setLineDiscount(pending.lineId, pending.percent);
    } else if (pending?.kind === "bill") {
      store.setBillDiscount({ isPercent: pending.isPercent, value: pending.value });
    }
    setPinDialog({ open: false, pending: null, error: null, forFinalSubmit: false });
  }

  function handleRemove(lineId: string) {
    const line = store.lines.find((l) => l.lineId === lineId);
    store.removeLine(lineId);
    if (line) {
      toast(`Removed ${line.itemName}`, {
        action: { label: "Undo", onClick: () => store.undoRemove() },
        duration: 5000,
      });
    }
  }

  function handleOverrideBatch(lineId: string, batchId: string) {
    const line = store.lines.find((l) => l.lineId === lineId);
    if (!line) return;
    const item = catalogByItemId.get(line.itemId);
    const batch = item?.batches.find((b) => b.id === batchId);
    if (!batch) return;
    store.overrideBatch(lineId, {
      batchId: batch.id,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate.toISOString(),
      availableQty: batch.currentQty,
      rate: batch.saleRate,
    });
  }

  async function submitSale() {
    if (!branchId) return;
    setSubmitting(true);
    try {
      const result = await completeSale({
        branchId,
        customerId: store.customerId,
        doctorId: store.doctorId,
        patientName: store.patientName || undefined,
        patientAge: store.patientAge ? Number(store.patientAge) : undefined,
        paymentMode: store.paymentMode,
        billDiscount: store.billDiscount,
        managerPin: managerPinRef.current,
        prescriptionImagePath: store.prescriptionImagePath ?? undefined,
        pharmacistReauth: pharmacistReauthRef.current,
        lines: store.lines.map((l) => ({
          itemId: l.itemId,
          batchId: l.batchId,
          qty: l.qty,
          discountPercent: l.discountPercent,
        })),
      });
      toast.success(`Sale completed — ${result.invoiceNo}`);
      store.reset();
      pinVerifiedRef.current = false;
      managerPinRef.current = undefined;
      pharmacistReauthRef.current = undefined;
      router.push(`/invoices/${result.invoiceId}/receipt`);
    } catch (e) {
      if (e instanceof Error && e.message === "MANAGER_PIN_REQUIRED") {
        setPinDialog({ open: true, pending: null, error: null, forFinalSubmit: true });
      } else if (e instanceof Error && e.message === "PHARMACIST_SIGNOFF_REQUIRED") {
        const retry = pharmacistReauthRef.current !== undefined;
        pharmacistReauthRef.current = undefined;
        setSignoffDialog({
          open: true,
          error: retry ? "Incorrect pharmacist email or password." : null,
          submitting: false,
        });
      } else {
        toast.error(e instanceof Error ? e.message : "Could not complete sale");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleCompleteSale() {
    if (blockedReason || submitting) return;
    void submitSale();
  }

  async function handleSignoffSubmit(email: string, password: string) {
    setSignoffDialog((d) => ({ ...d, submitting: true, error: null }));
    const result = await verifyPharmacistCredentials(email, password);
    if (!result) {
      setSignoffDialog({ open: true, error: "Incorrect pharmacist email or password.", submitting: false });
      return;
    }
    pharmacistReauthRef.current = { email, password };
    setSignoffDialog({ open: false, error: null, submitting: false });
    void submitSale();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "F9") {
        e.preventDefault();
        handleCompleteSale();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockedReason, submitting, store]);

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <SearchPanel items={items} onSelect={handleAddItem} inputRef={searchInputRef} />

        {needsPrescription && (
          <div className="space-y-2">
            <PrescriptionFields
              doctors={doctorList}
              doctorId={store.doctorId}
              onDoctorChange={store.setDoctor}
              patientName={store.patientName}
              onPatientNameChange={store.setPatientName}
              patientAge={store.patientAge}
              onPatientAgeChange={store.setPatientAge}
              onDoctorCreated={(d) => setDoctorList((prev) => [...prev, d])}
            />
            <div className="flex items-center justify-between rounded-lg border p-3">
              <PrescriptionUpload
                path={store.prescriptionImagePath}
                onPathChange={store.setPrescriptionImagePath}
              />
              <p className="text-xs text-muted-foreground">
                {SELF_SIGNOFF_ROLES.has(role)
                  ? "You will sign off this dispense."
                  : "A pharmacist will need to sign off before this sale completes."}
              </p>
            </div>
          </div>
        )}

        <CartTable
          lines={store.lines}
          catalogByItemId={catalogByItemId}
          focusLineId={store.focusLineId}
          onFocusHandled={store.clearFocusLine}
          onQtyChange={store.updateQty}
          onQtyEnter={focusSearch}
          onDiscountChange={handleLineDiscountChange}
          onOverrideBatch={handleOverrideBatch}
          onRemove={handleRemove}
        />
      </div>

      <BottomBar
        billing={billing}
        billDiscountValue={store.billDiscount.value}
        billDiscountIsPercent={store.billDiscount.isPercent}
        onBillDiscountChange={handleBillDiscountChange}
        customers={customers}
        customerId={store.customerId}
        onCustomerChange={store.setCustomer}
        paymentMode={store.paymentMode}
        onPaymentModeChange={store.setPaymentMode}
        onCompleteSale={handleCompleteSale}
        submitting={submitting}
        blockedReason={blockedReason}
      />

      <ManagerPinDialog
        open={pinDialog.open}
        onOpenChange={(open) => setPinDialog((d) => ({ ...d, open }))}
        onSubmit={handlePinSubmit}
        error={pinDialog.error}
        reason={
          pinDialog.forFinalSubmit
            ? "This sale includes a discount above your approval limit."
            : "This discount exceeds the staff limit. Enter the manager PIN to override."
        }
      />

      <PharmacistSignoffDialog
        open={signoffDialog.open}
        onOpenChange={(open) => setSignoffDialog((d) => ({ ...d, open }))}
        onSubmit={handleSignoffSubmit}
        error={signoffDialog.error}
        submitting={signoffDialog.submitting}
      />
    </div>
  );
}
