import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: "demo-tenant" },
    update: {},
    create: {
      id: "demo-tenant",
      pharmacyName: "Demo Pharmacy",
      tenantType: "retail",
      invoiceFooterText: "Thank you for visiting. Medicines once sold are not returnable.",
      staffDiscountCapPercent: 10,
      managerPinHash: await bcrypt.hash("1234", 10),
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
    },
    {
      id: "demo-pharmacist",
      name: "Staff Pharmacist",
      email: "pharmacist@demo-pharmacy.local",
      role: "pharmacist" as const,
      password: "Pharmacist@12345",
    },
    {
      id: "demo-counter",
      name: "Counter Staff",
      email: "counter@demo-pharmacy.local",
      role: "counter_staff" as const,
      password: "Counter@12345",
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

  console.log("Seeded tenant:", tenant.pharmacyName, "branch:", branch.name);
  console.log("Login with owner@demo-pharmacy.local / Owner@12345");
  console.log("Manager PIN for discount overrides: 1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
