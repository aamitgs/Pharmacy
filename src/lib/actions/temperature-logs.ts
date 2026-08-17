"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "@/lib/rbac";
import { getBranchFilter, resolveConcreteBranch } from "@/lib/branch-scope";
import { writeAuditLog } from "@/lib/audit";
import { isColdChainOutOfRange } from "@/lib/cold-chain";

const recordSchema = z.object({
  temperatureCelsius: z.coerce.number().min(-50).max(60),
  recordedAt: z.string().optional(),
  note: z.string().trim().max(300).optional(),
});

export type RecordTemperatureLogInput = z.infer<typeof recordSchema>;

export async function listTemperatureLogs() {
  const session = await requireRetailSession();
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const logs = await prisma.temperatureLog.findMany({
    where: { tenantId: session.user.tenantId, ...branchFilter },
    include: { branch: { select: { name: true } }, recordedBy: { select: { name: true } } },
    orderBy: { recordedAt: "desc" },
    take: 100,
  });
  return logs.map((l) => ({
    id: l.id,
    branchName: l.branch.name,
    temperatureCelsius: Number(l.temperatureCelsius),
    recordedAt: l.recordedAt.toISOString(),
    recordedByName: l.recordedBy.name,
    note: l.note,
    outOfRange: isColdChainOutOfRange(Number(l.temperatureCelsius)),
  }));
}

export async function recordTemperatureLog(input: RecordTemperatureLogInput) {
  const session = await requireRetailSession();
  const parsed = recordSchema.parse(input);

  const branchId = await resolveConcreteBranch(session.user.tenantId, session.user.role);
  if (!branchId) throw new Error("No branch configured for this tenant.");

  const log = await prisma.temperatureLog.create({
    data: {
      tenantId: session.user.tenantId,
      branchId,
      temperatureCelsius: parsed.temperatureCelsius,
      recordedAt: parsed.recordedAt ? new Date(parsed.recordedAt) : new Date(),
      recordedByUserId: session.user.id,
      note: parsed.note || null,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "temperature_log.record",
    entity: "TemperatureLog",
    entityId: log.id,
    after: { branchId, temperatureCelsius: parsed.temperatureCelsius },
  });

  revalidatePath("/cold-chain-log");
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  return { id: log.id, outOfRange: isColdChainOutOfRange(parsed.temperatureCelsius) };
}
