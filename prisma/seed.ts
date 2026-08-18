import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Trusted one-shot script that exits right after seeding — safe to set the
  // RLS bypass flag at session level (is_local=false) instead of per-query.
  await prisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', false)`;

  const tenant = await prisma.tenant.upsert({
    where: { id: "demo-tenant" },
    update: {},
    create: {
      id: "demo-tenant",
      pharmacyName: "Demo Pharmacy",
      tenantType: "retail",
      portalSlug: "demo-tenant",
      invoiceFooterText: "Thank you for visiting. Medicines once sold are not returnable.",
      staffDiscountCapPercent: 10,
      nearExpiryWindowDays: 90,
    },
  });

  const branch = await prisma.branch.upsert({
    where: { id: "demo-branch" },
    update: {},
    create: {
      id: "demo-branch",
      tenantId: tenant.id,
      name: "Main Branch",
      licensedAddress: "12 MG Road, Bengaluru, Karnataka 560001",
      gstin: "29ABCDE1234F1Z5",
      pan: "ABCDE1234F",
      drugLicenseRetailNo: "KA-RET-2024-00123",
      drugLicenseWholesaleNo: "KA-WS-2024-00456",
      pharmacistName: "Dr. Asha Rao",
      pharmacistRegistrationNo: "KA-PH-98765",
    },
  });

  const users = [
    {
      id: "demo-owner",
      name: "Owner Admin",
      email: "owner@demo-pharmacy.local",
      role: "owner" as const,
      password: "Owner@12345",
      // Distinct per manager on purpose: the whole point of the per-user
      // override PIN is that a sale can name who approved it, and two
      // managers sharing a PIN would defeat that (setOwnOverridePin refuses
      // a duplicate for the same reason).
      overridePin: "491703",
    },
    {
      id: "demo-pharmacist",
      name: "Staff Pharmacist",
      email: "pharmacist@demo-pharmacy.local",
      role: "pharmacist" as const,
      password: "Pharmacist@12345",
      overridePin: "528361",
    },
    {
      id: "demo-counter",
      name: "Counter Staff",
      email: "counter@demo-pharmacy.local",
      role: "counter_staff" as const,
      password: "Counter@12345",
      overridePin: null,
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: {},
      create: {
        id: u.id,
        tenantId: tenant.id,
        name: u.name,
        email: u.email,
        role: u.role,
        passwordHash: await bcrypt.hash(u.password, 10),
        overridePinHash: u.overridePin ? await bcrypt.hash(u.overridePin, 10) : null,
      },
    });
  }

  const item = await prisma.item.upsert({
    where: { id: "demo-item-para" },
    update: {},
    create: {
      id: "demo-item-para",
      tenantId: tenant.id,
      name: "Paracetamol 500mg",
      genericName: "Paracetamol",
      manufacturer: "Cipla",
      composition: "Paracetamol 500mg",
      scheduleClass: "none",
      hsnCode: "3004",
      taxRate: 12,
      unit: "strip",
      packSize: "10 tablets",
      reorderLevel: 20,
    },
  });

  await prisma.batch.upsert({
    where: { id: "demo-batch-para-1" },
    update: {},
    create: {
      id: "demo-batch-para-1",
      itemId: item.id,
      branchId: branch.id,
      batchNo: "PCM24A",
      mfgDate: new Date("2024-06-01"),
      expiryDate: new Date("2027-06-30"),
      mrp: 30,
      purchaseRate: 18,
      saleRate: 28,
      currentQty: 500,
      rackLocation: "A1-03",
    },
  });

  const cough = await prisma.item.upsert({
    where: { id: "demo-item-cough" },
    update: {},
    create: {
      id: "demo-item-cough",
      tenantId: tenant.id,
      name: "Corex Cough Syrup",
      genericName: "Codeine + CPM",
      manufacturer: "Pfizer",
      composition: "Codeine Phosphate + Chlorpheniramine Maleate",
      scheduleClass: "H",
      hsnCode: "3004",
      taxRate: 12,
      unit: "bottle",
      packSize: "100ml",
      reorderLevel: 10,
    },
  });

  await prisma.batch.upsert({
    where: { id: "demo-batch-cough-1" },
    update: {},
    create: {
      id: "demo-batch-cough-1",
      itemId: cough.id,
      branchId: branch.id,
      batchNo: "CRX24B",
      mfgDate: new Date("2024-01-01"),
      expiryDate: new Date("2026-09-15"),
      mrp: 95,
      purchaseRate: 60,
      saleRate: 90,
      currentQty: 40,
      rackLocation: "B2-01",
    },
  });

  await prisma.doctor.upsert({
    where: { id: "demo-doctor-1" },
    update: {},
    create: {
      id: "demo-doctor-1",
      tenantId: tenant.id,
      name: "Dr. Ramesh Iyer",
      registrationNo: "KMC-45231",
      clinicName: "City Health Clinic",
    },
  });

  const plans = [
    { code: "trial", name: "Free Trial", priceMonthly: 0, maxBranches: 1, maxUsers: 3, whiteLabel: false, publicApiAccess: false, contactSalesOnly: false, sortOrder: 0 },
    { code: "growth", name: "Growth", priceMonthly: 999, maxBranches: 3, maxUsers: 10, whiteLabel: false, publicApiAccess: false, contactSalesOnly: false, sortOrder: 1 },
    { code: "premium", name: "Premium", priceMonthly: 2999, maxBranches: null, maxUsers: null, whiteLabel: true, publicApiAccess: true, contactSalesOnly: false, sortOrder: 2 },
    { code: "enterprise", name: "Enterprise", priceMonthly: 0, maxBranches: null, maxUsers: null, whiteLabel: true, publicApiAccess: true, contactSalesOnly: true, sortOrder: 3 },
  ];
  for (const p of plans) {
    await prisma.subscriptionPlan.upsert({ where: { code: p.code }, update: {}, create: p });
  }
  const premiumPlan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: "premium" } });
  await prisma.tenantSubscription.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      planId: premiumPlan.id,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // Phase 10.2: a small, curated starter set of well-known,
  // clinically-significant interaction pairs (not a comprehensive
  // drug-interaction database — see the model's comment in schema.prisma).
  // Sourced from standard pharmacology teaching references (BNF/Stockley's
  // Drug Interactions-style textbook-classic pairs), reviewed for accuracy
  // before shipping rather than machine-translated/generated. Global
  // reference data — seeded once, shared by every tenant, upserted by a
  // deterministic id so re-running this script never duplicates rows.
  const interactionRules: {
    id: string;
    compositionA: string;
    compositionB: string;
    severity: "caution" | "warning";
    description: string;
  }[] = [
    {
      id: "interaction-warfarin-aspirin",
      compositionA: "Warfarin",
      compositionB: "Aspirin",
      severity: "warning",
      description: "Combining an anticoagulant with an antiplatelet substantially raises bleeding risk — confirm this is intended and prescriber-reviewed.",
    },
    {
      id: "interaction-warfarin-ibuprofen",
      compositionA: "Warfarin",
      compositionB: "Ibuprofen",
      severity: "warning",
      description: "NSAIDs can displace warfarin from plasma proteins and irritate the GI mucosa, increasing bleeding risk when combined with an anticoagulant.",
    },
    {
      id: "interaction-warfarin-amiodarone",
      compositionA: "Warfarin",
      compositionB: "Amiodarone",
      severity: "warning",
      description: "Amiodarone significantly increases warfarin's anticoagulant effect — INR should be monitored closely with this combination.",
    },
    {
      id: "interaction-aspirin-ibuprofen",
      compositionA: "Aspirin",
      compositionB: "Ibuprofen",
      severity: "caution",
      description: "Ibuprofen can blunt aspirin's cardioprotective antiplatelet effect and adds GI bleeding risk when taken together regularly.",
    },
    {
      id: "interaction-sildenafil-nitroglycerin",
      compositionA: "Sildenafil",
      compositionB: "Nitroglycerin",
      severity: "warning",
      description: "PDE5 inhibitors combined with nitrates can cause a severe, potentially life-threatening drop in blood pressure.",
    },
    {
      id: "interaction-enalapril-spironolactone",
      compositionA: "Enalapril",
      compositionB: "Spironolactone",
      severity: "warning",
      description: "ACE inhibitors combined with a potassium-sparing diuretic raise the risk of dangerous hyperkalemia.",
    },
    {
      id: "interaction-atorvastatin-clarithromycin",
      compositionA: "Atorvastatin",
      compositionB: "Clarithromycin",
      severity: "warning",
      description: "Macrolide antibiotics can raise statin blood levels substantially, increasing the risk of myopathy/rhabdomyolysis.",
    },
    {
      id: "interaction-methotrexate-ibuprofen",
      compositionA: "Methotrexate",
      compositionB: "Ibuprofen",
      severity: "warning",
      description: "NSAIDs can reduce methotrexate clearance, raising the risk of methotrexate toxicity.",
    },
    {
      id: "interaction-digoxin-furosemide",
      compositionA: "Digoxin",
      compositionB: "Furosemide",
      severity: "caution",
      description: "Loop diuretics can cause hypokalemia, which increases the risk of digoxin toxicity — electrolytes are worth monitoring.",
    },
    {
      id: "interaction-ciprofloxacin-calcium-carbonate",
      compositionA: "Ciprofloxacin",
      compositionB: "Calcium Carbonate",
      severity: "caution",
      description: "Calcium/antacids chelate fluoroquinolones and substantially reduce absorption — space doses several hours apart.",
    },
    {
      id: "interaction-levothyroxine-calcium-carbonate",
      compositionA: "Levothyroxine",
      compositionB: "Calcium Carbonate",
      severity: "caution",
      description: "Calcium supplements/antacids reduce levothyroxine absorption — space doses at least 4 hours apart.",
    },
    {
      id: "interaction-tramadol-sertraline",
      compositionA: "Tramadol",
      compositionB: "Sertraline",
      severity: "warning",
      description: "Combining tramadol with an SSRI raises the risk of serotonin syndrome.",
    },
    {
      id: "interaction-clopidogrel-omeprazole",
      compositionA: "Clopidogrel",
      compositionB: "Omeprazole",
      severity: "caution",
      description: "Omeprazole can inhibit the enzyme that activates clopidogrel, potentially reducing its antiplatelet effect.",
    },
    {
      id: "interaction-amlodipine-simvastatin",
      compositionA: "Amlodipine",
      compositionB: "Simvastatin",
      severity: "caution",
      description: "Amlodipine raises simvastatin exposure — a lower simvastatin dose is usually advised with this combination.",
    },
    {
      id: "interaction-domperidone-fluconazole",
      compositionA: "Domperidone",
      compositionB: "Fluconazole",
      severity: "warning",
      description: "Azole antifungals can raise domperidone levels and QT-prolongation risk — this combination needs caution.",
    },
  ];
  for (const rule of interactionRules) {
    await prisma.interactionRule.upsert({ where: { id: rule.id }, update: {}, create: rule });
  }

  await prisma.superAdmin.upsert({
    where: { email: "admin@platform.local" },
    update: {},
    create: {
      email: "admin@platform.local",
      name: "Platform Admin",
      passwordHash: await bcrypt.hash("PlatformAdmin@12345", 10),
    },
  });

  console.log("Seeded tenant:", tenant.pharmacyName, "branch:", branch.name);
  console.log("Admin console login: admin@platform.local / PlatformAdmin@12345");
  console.log("Login with owner@demo-pharmacy.local / Owner@12345");
  console.log("Discount-override PINs — owner: 491703, pharmacist: 528361");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
