"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import type { LicenseType } from "@/lib/license-types";

export async function getBranchSettings() {
  const session = await requireRole(["owner", "pharmacist"]);
  const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId: session.user.tenantId } });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } });

  const expiryDates = (branch.licenseExpiryDates ?? {}) as Partial<Record<LicenseType, string>>;

  return {
    branchId: branch.id,
    drugLicenseRetailNo: branch.drugLicenseRetailNo,
    drugLicenseWholesaleNo: branch.drugLicenseWholesaleNo,
    narcoticLicenseNo: branch.narcoticLicenseNo,
    fssaiNo: branch.fssaiNo,
    licenseExpiryDates: expiryDates,
    licenseExpiryWindowDays: tenant.licenseExpiryWindowDays,
  };
}

const updateSchema = z.object({
  drugLicenseRetailNo: z.string().trim().optional(),
  drugLicenseWholesaleNo: z.string().trim().optional(),
  narcoticLicenseNo: z.string().trim().optional(),
  fssaiNo: z.string().trim().optional(),
  licenseExpiryDates: z.object({
    retail: z.string().optional(),
    wholesale: z.string().optional(),
    narcotic: z.string().optional(),
    fssai: z.string().optional(),
  }),
  licenseExpiryWindowDays: z.coerce.number().int().positive(),
});

export type UpdateBranchSettingsInput = z.infer<typeof updateSchema>;

export async function updateBranchSettings(input: UpdateBranchSettingsInput) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = updateSchema.parse(input);
  const tenantId = session.user.tenantId;

  const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId } });

  const before = {
    drugLicenseRetailNo: branch.drugLicenseRetailNo,
    drugLicenseWholesaleNo: branch.drugLicenseWholesaleNo,
    narcoticLicenseNo: branch.narcoticLicenseNo,
    fssaiNo: branch.fssaiNo,
    licenseExpiryDates: branch.licenseExpiryDates,
  };

  // Drop empty strings so "cleared" fields store as null/absent, not "".
  const cleanExpiryDates = Object.fromEntries(
    Object.entries(parsed.licenseExpiryDates).filter(([, v]) => v)
  );

  await prisma.$transaction([
    prisma.branch.update({
      where: { id: branch.id },
      data: {
        drugLicenseRetailNo: parsed.drugLicenseRetailNo || null,
        drugLicenseWholesaleNo: parsed.drugLicenseWholesaleNo || null,
        narcoticLicenseNo: parsed.narcoticLicenseNo || null,
        fssaiNo: parsed.fssaiNo || null,
        licenseExpiryDates: cleanExpiryDates,
      },
    }),
    prisma.tenant.update({
      where: { id: tenantId },
      data: { licenseExpiryWindowDays: parsed.licenseExpiryWindowDays },
    }),
  ]);

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "branch.compliance_update",
    entity: "Branch",
    entityId: branch.id,
    before,
    after: { ...parsed, licenseExpiryDates: cleanExpiryDates },
  });

  revalidatePath("/settings");
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}
