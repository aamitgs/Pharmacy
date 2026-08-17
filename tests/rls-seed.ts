import bcrypt from "bcryptjs";
import { basePrisma } from "@/lib/prisma";

/**
 * Creates one full vertical slice of data — one row in every RLS-protected
 * table, direct and indirect — for a single tenant, using the unextended
 * base client with the bypass flag (this is test fixture setup, not the
 * thing under test). Returns the created ids so tests can build queries
 * across tenant boundaries.
 */
export async function seedTenantSlice(suffix: string) {
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`;

    const tenant = await tx.tenant.create({
      data: { id: `t-${suffix}`, pharmacyName: `Test Pharmacy ${suffix}`, portalSlug: `test-${suffix}` },
    });

    const branch = await tx.branch.create({
      data: {
        id: `branch-${suffix}`,
        tenantId: tenant.id,
        name: `Branch ${suffix}`,
        licensedAddress: "1 Test Street",
      },
    });
    const branch2 = await tx.branch.create({
      data: {
        id: `branch2-${suffix}`,
        tenantId: tenant.id,
        name: `Branch 2 ${suffix}`,
        licensedAddress: "2 Test Street",
      },
    });

    const owner = await tx.user.create({
      data: {
        id: `user-${suffix}`,
        tenantId: tenant.id,
        name: `Owner ${suffix}`,
        email: `owner-${suffix}@test.local`,
        role: "owner",
        passwordHash: await bcrypt.hash("Test@12345", 4),
      },
    });

    const item = await tx.item.create({
      data: { id: `item-${suffix}`, tenantId: tenant.id, name: `Item ${suffix}` },
    });

    const batch = await tx.batch.create({
      data: {
        id: `batch-${suffix}`,
        itemId: item.id,
        branchId: branch.id,
        batchNo: `B-${suffix}`,
        expiryDate: new Date("2027-01-01"),
        mrp: 100,
        purchaseRate: 60,
        saleRate: 90,
        currentQty: 50,
      },
    });

    const loyaltyTier = await tx.loyaltyTier.create({
      data: { id: `tier-${suffix}`, tenantId: tenant.id, name: `Tier ${suffix}`, minCumulativeSpend: 0, discountPercent: 5 },
    });

    const customer = await tx.customer.create({
      data: { id: `customer-${suffix}`, tenantId: tenant.id, name: `Customer ${suffix}`, loyaltyTierId: loyaltyTier.id },
    });

    const doctor = await tx.doctor.create({
      data: { id: `doctor-${suffix}`, tenantId: tenant.id, name: `Doctor ${suffix}` },
    });

    const scheme = await tx.scheme.create({
      data: {
        id: `scheme-${suffix}`,
        tenantId: tenant.id,
        name: `Scheme ${suffix}`,
        type: "percent_off",
        config: { percent: 5 },
        validFrom: new Date("2020-01-01"),
        validTo: new Date("2030-01-01"),
      },
    });

    const coupon = await tx.coupon.create({
      data: {
        id: `coupon-${suffix}`,
        tenantId: tenant.id,
        code: `CODE-${suffix}`,
        type: "flat",
        value: 10,
        validFrom: new Date("2020-01-01"),
        validTo: new Date("2030-01-01"),
      },
    });

    const supplier = await tx.supplier.create({
      data: { id: `supplier-${suffix}`, tenantId: tenant.id, name: `Supplier ${suffix}` },
    });

    const purchaseOrder = await tx.purchaseOrder.create({
      data: {
        id: `po-${suffix}`,
        tenantId: tenant.id,
        branchId: branch.id,
        supplierId: supplier.id,
        createdByUserId: owner.id,
      },
    });
    const purchaseOrderItem = await tx.purchaseOrderItem.create({
      data: { id: `poi-${suffix}`, purchaseOrderId: purchaseOrder.id, itemId: item.id, qty: 10, rate: 60 },
    });

    const grn = await tx.grn.create({
      data: {
        id: `grn-${suffix}`,
        tenantId: tenant.id,
        branchId: branch.id,
        purchaseOrderId: purchaseOrder.id,
        supplierId: supplier.id,
        supplierInvoiceNo: `SINV-${suffix}`,
        supplierInvoiceDate: new Date(),
        receivedByUserId: owner.id,
      },
    });
    const grnItem = await tx.grnItem.create({
      data: {
        id: `grni-${suffix}`,
        grnId: grn.id,
        itemId: item.id,
        batchId: batch.id,
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate,
        mrp: 100,
        rate: 60,
        qty: 10,
      },
    });

    const purchaseReturn = await tx.purchaseReturn.create({
      data: {
        id: `pr-${suffix}`,
        tenantId: tenant.id,
        branchId: branch.id,
        grnId: grn.id,
        supplierId: supplier.id,
        totalAmount: 60,
        createdByUserId: owner.id,
      },
    });
    const purchaseReturnItem = await tx.purchaseReturnItem.create({
      data: { id: `pri-${suffix}`, purchaseReturnId: purchaseReturn.id, itemId: item.id, batchId: batch.id, qty: 1, rate: 60 },
    });

    const supplierLedgerEntry = await tx.supplierLedgerEntry.create({
      data: { id: `sle-${suffix}`, tenantId: tenant.id, supplierId: supplier.id, type: "purchase", amount: 600 },
    });

    const stockTransfer = await tx.stockTransfer.create({
      data: {
        id: `st-${suffix}`,
        tenantId: tenant.id,
        fromBranchId: branch.id,
        toBranchId: branch2.id,
        requestedByUserId: owner.id,
      },
    });
    const stockTransferItem = await tx.stockTransferItem.create({
      data: { id: `sti-${suffix}`, transferId: stockTransfer.id, itemId: item.id, batchId: batch.id, qty: 1 },
    });

    const invoice = await tx.salesInvoice.create({
      data: {
        id: `inv-${suffix}`,
        tenantId: tenant.id,
        branchId: branch.id,
        customerId: customer.id,
        doctorId: doctor.id,
        invoiceNo: `INV-${suffix}`,
        subtotal: 90,
        taxAmount: 10.8,
        total: 100.8,
        paymentMode: "cash",
      },
    });
    const invoiceItem = await tx.salesInvoiceItem.create({
      data: { id: `invi-${suffix}`, invoiceId: invoice.id, itemId: item.id, batchId: batch.id, qty: 1, rate: 90, taxRate: 12 },
    });

    const discount = await tx.discount.create({
      data: {
        id: `disc-${suffix}`,
        tenantId: tenant.id,
        invoiceId: invoice.id,
        invoiceItemId: invoiceItem.id,
        type: "scheme",
        amountOrPercent: 5,
        amount: 4.5,
        schemeId: scheme.id,
        couponId: coupon.id,
        appliedByUserId: owner.id,
      },
    });

    const customerLedgerEntry = await tx.customerLedgerEntry.create({
      data: { id: `cle-${suffix}`, tenantId: tenant.id, customerId: customer.id, type: "sale", amount: 100.8, referenceId: invoice.id },
    });

    const whatsappLog = await tx.whatsAppLog.create({
      data: {
        id: `wa-${suffix}`,
        tenantId: tenant.id,
        customerId: customer.id,
        invoiceId: invoice.id,
        phone: "9999999999",
        messageType: "receipt",
        status: "sent",
      },
    });

    const narcoticRegisterEntry = await tx.narcoticRegisterEntry.create({
      data: {
        id: `nre-${suffix}`,
        tenantId: tenant.id,
        branchId: branch.id,
        invoiceId: invoice.id,
        itemId: item.id,
        batchId: batch.id,
        qty: 1,
        doctorId: doctor.id,
        dispensedByUserId: owner.id,
      },
    });

    const auditLog = await tx.auditLog.create({
      data: { id: `al-${suffix}`, tenantId: tenant.id, userId: owner.id, action: "create", entity: "Item", entityId: item.id },
    });

    const backupLog = await tx.backupLog.create({
      data: { id: `bl-${suffix}`, tenantId: tenant.id, destination: "local", status: "success" },
    });

    // subscription_plans is a shared, un-RLS'd catalog (no tenantId) — reuse
    // one fixed row across test runs rather than creating a new one per slice.
    const plan = await tx.subscriptionPlan.upsert({
      where: { code: "rls-test-plan" },
      update: {},
      create: { code: "rls-test-plan", name: "RLS Test Plan", priceMonthly: 0, active: false },
    });
    const tenantSubscription = await tx.tenantSubscription.create({
      data: { id: `sub-${suffix}`, tenantId: tenant.id, planId: plan.id, status: "trialing" },
    });

    const apiKey = await tx.apiKey.create({
      data: { id: `apikey-${suffix}`, tenantId: tenant.id, name: "Test key", keyHash: `hash-${suffix}`, keyPrefix: "phk_test" },
    });

    // Phase 8: cloud backup connection fixture.
    const cloudBackupConnection = await tx.cloudBackupConnection.create({
      data: {
        id: `cloudbackup-${suffix}`,
        tenantId: tenant.id,
        provider: "google_drive",
        accessTokenEnc: "enc-access",
        refreshTokenEnc: "enc-refresh",
        expiresAt: new Date(Date.now() + 3600_000),
        connectedByUserId: owner.id,
      },
    });

    // Phase 8: refill reminder fixture.
    const refillReminder = await tx.refillReminder.create({
      data: {
        id: `refillrem-${suffix}`,
        tenantId: tenant.id,
        customerId: customer.id,
        itemId: item.id,
        lastPurchaseDate: new Date("2026-06-01"),
        expectedDate: new Date("2026-07-01"),
        status: "sent",
      },
    });

    // Phase 8: insurance/TPA cashless billing fixtures.
    const insuranceProvider = await tx.insuranceProvider.create({
      data: { id: `insprov-${suffix}`, tenantId: tenant.id, name: `Insurer ${suffix}` },
    });
    const insuranceClaim = await tx.insuranceClaim.create({
      data: {
        id: `inscl-${suffix}`,
        tenantId: tenant.id,
        invoiceId: invoice.id,
        insuranceProviderId: insuranceProvider.id,
        claimedAmount: 100.8,
        coPayAmount: 0,
      },
    });

    // Phase 7: Hospital Mode fixtures — one full vertical slice, same as
    // everything above.
    const ward = await tx.ward.create({
      data: { id: `ward-${suffix}`, tenantId: tenant.id, branchId: branch.id, name: `Ward ${suffix}`, type: "general" },
    });

    const wardBatch = await tx.batch.create({
      data: {
        id: `wbatch-${suffix}`,
        itemId: item.id,
        branchId: branch.id,
        wardId: ward.id,
        batchNo: `WB-${suffix}`,
        expiryDate: new Date("2027-01-01"),
        mrp: 100,
        purchaseRate: 60,
        saleRate: 90,
        currentQty: 20,
      },
    });

    const wardAssignment = await tx.wardAssignment.create({
      data: { id: `wa-${suffix}`, tenantId: tenant.id, userId: owner.id, wardId: ward.id },
    });

    const indent = await tx.indent.create({
      data: { id: `indent-${suffix}`, tenantId: tenant.id, wardId: ward.id, requestedByUserId: owner.id },
    });
    const indentItem = await tx.indentItem.create({
      data: { id: `indenti-${suffix}`, indentId: indent.id, itemId: item.id, batchId: batch.id, qtyRequested: 5 },
    });

    const patientAdmission = await tx.patientAdmission.create({
      data: {
        id: `adm-${suffix}`,
        tenantId: tenant.id,
        admissionRef: `ADM-${suffix}`,
        patientName: `Patient ${suffix}`,
        wardId: ward.id,
      },
    });
    const ipdDispense = await tx.ipdDispense.create({
      data: {
        id: `ipd-${suffix}`,
        tenantId: tenant.id,
        admissionId: patientAdmission.id,
        itemId: item.id,
        batchId: wardBatch.id,
        qty: 2,
        dispensedByUserId: owner.id,
      },
    });

    // Phase 9: rate contract fixture.
    const rateContract = await tx.rateContract.create({
      data: {
        id: `ratecontract-${suffix}`,
        tenantId: tenant.id,
        customerId: customer.id,
        itemId: item.id,
        contractRate: 80,
        validFrom: new Date("2020-01-01"),
        validTo: new Date("2030-01-01"),
      },
    });

    // Phase 9: cold-chain temperature log fixture.
    const temperatureLog = await tx.temperatureLog.create({
      data: {
        id: `templog-${suffix}`,
        tenantId: tenant.id,
        branchId: branch.id,
        temperatureCelsius: 5,
        recordedByUserId: owner.id,
      },
    });

    // Phase 9: customer portal fixtures.
    const customerOtp = await tx.customerOtp.create({
      data: {
        id: `otp-${suffix}`,
        tenantId: tenant.id,
        customerId: customer.id,
        codeHash: "hash",
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    const refillRequest = await tx.refillRequest.create({
      data: {
        id: `refillreq-${suffix}`,
        tenantId: tenant.id,
        customerId: customer.id,
        invoiceId: invoice.id,
      },
    });

    // Phase 9: owner mobile PWA push subscription fixture.
    const pushSubscription = await tx.pushSubscription.create({
      data: {
        id: `push-${suffix}`,
        tenantId: tenant.id,
        userId: owner.id,
        endpoint: `https://push.example.com/${suffix}`,
        p256dh: "p256dh-key",
        authKey: "auth-key",
      },
    });

    return {
      tenantId: tenant.id,
      branchId: branch.id,
      branch2Id: branch2.id,
      userId: owner.id,
      itemId: item.id,
      batchId: batch.id,
      customerId: customer.id,
      doctorId: doctor.id,
      loyaltyTierId: loyaltyTier.id,
      schemeId: scheme.id,
      couponId: coupon.id,
      supplierId: supplier.id,
      purchaseOrderId: purchaseOrder.id,
      purchaseOrderItemId: purchaseOrderItem.id,
      grnId: grn.id,
      grnItemId: grnItem.id,
      purchaseReturnId: purchaseReturn.id,
      purchaseReturnItemId: purchaseReturnItem.id,
      supplierLedgerEntryId: supplierLedgerEntry.id,
      stockTransferId: stockTransfer.id,
      stockTransferItemId: stockTransferItem.id,
      invoiceId: invoice.id,
      invoiceItemId: invoiceItem.id,
      discountId: discount.id,
      customerLedgerEntryId: customerLedgerEntry.id,
      whatsappLogId: whatsappLog.id,
      narcoticRegisterEntryId: narcoticRegisterEntry.id,
      auditLogId: auditLog.id,
      backupLogId: backupLog.id,
      tenantSubscriptionId: tenantSubscription.id,
      apiKeyId: apiKey.id,
      cloudBackupConnectionId: cloudBackupConnection.id,
      refillReminderId: refillReminder.id,
      insuranceProviderId: insuranceProvider.id,
      insuranceClaimId: insuranceClaim.id,
      wardId: ward.id,
      wardBatchId: wardBatch.id,
      wardAssignmentId: wardAssignment.id,
      indentId: indent.id,
      indentItemId: indentItem.id,
      patientAdmissionId: patientAdmission.id,
      ipdDispenseId: ipdDispense.id,
      customerOtpId: customerOtp.id,
      refillRequestId: refillRequest.id,
      pushSubscriptionId: pushSubscription.id,
      rateContractId: rateContract.id,
      temperatureLogId: temperatureLog.id,
    };
  });
}

export async function deleteTenant(tenantId: string) {
  // Tenant's own cascade removes most rows, but a handful of child tables
  // (Batch -> Branch, and every *Item table -> Batch) reference their
  // non-tenant parent without ON DELETE CASCADE, so they must be cleared
  // explicitly first or the cascade hits a foreign key violation.
  await basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`;
    // patientAdmission delete cascades ipd_dispenses (which RESTRICT-block
    // batch deletion below); indent delete cascades indent_items. Both must
    // also clear before wards, since indents/patient_admissions -> wards is
    // RESTRICT, not CASCADE.
    await tx.patientAdmission.deleteMany({ where: { tenantId } });
    await tx.indent.deleteMany({ where: { tenantId } });
    await tx.narcoticRegisterEntry.deleteMany({ where: { tenantId } });
    await tx.discount.deleteMany({ where: { tenantId } });
    await tx.salesInvoiceItem.deleteMany({ where: { invoice: { tenantId } } });
    await tx.grnItem.deleteMany({ where: { grn: { tenantId } } });
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { tenantId } } });
    await tx.purchaseReturnItem.deleteMany({ where: { purchaseReturn: { tenantId } } });
    await tx.stockTransferItem.deleteMany({ where: { transfer: { tenantId } } });
    await tx.batch.deleteMany({ where: { item: { tenantId } } });
    await tx.tenant.delete({ where: { id: tenantId } });
  });
}

export type TenantSlice = Awaited<ReturnType<typeof seedTenantSlice>>;
