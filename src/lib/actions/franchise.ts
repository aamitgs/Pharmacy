"use server";

import { z } from "zod";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { basePrisma, prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

function generateJoinCode(): string {
  // 8 uppercase alphanumeric chars, no ambiguous 0/O/1/I — meant to be
  // read aloud or typed by hand when a franchisor shares it with a
  // prospective member out-of-band (phone/email), same reasoning as most
  // real-world invite codes.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * A franchisor reading a member's `pharmacyName` doesn't need a
 * cross-tenant context override — the `tenants` table's own RLS policy
 * (see migration 20260818120000) has a narrow, explicit exception letting
 * a franchisor read a member's basic Tenant row directly, the same way it
 * reads franchise_groups/franchise_members. Nothing sensitive crosses the
 * boundary here, just a display name.
 */
async function getTenantPharmacyName(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { pharmacyName: true } });
  return tenant.pharmacyName;
}

export interface FranchiseStatus {
  role: "none" | "owner" | "member";
  group: {
    id: string;
    name: string;
    joinCode: string | null; // only revealed to the owner
    itemListPushedAt: string | null;
    members: { tenantId: string; pharmacyName: string; rollupOptIn: boolean; joinedAt: string }[];
  } | null;
  membership: { rollupOptIn: boolean; groupName: string } | null;
}

/** What the current tenant's role is in franchising, if any — drives the /franchise screen. */
export async function getFranchiseStatus(): Promise<FranchiseStatus> {
  const session = await requireRole(["owner"]);
  const tenantId = session.user.tenantId;

  const owned = await prisma.franchiseGroup.findUnique({
    where: { ownerTenantId: tenantId },
    include: { members: true },
  });
  if (owned) {
    const members = await Promise.all(
      owned.members.map(async (m) => ({
        tenantId: m.tenantId,
        pharmacyName: await getTenantPharmacyName(m.tenantId),
        rollupOptIn: m.rollupOptIn,
        joinedAt: m.joinedAt.toISOString(),
      }))
    );
    return {
      role: "owner",
      group: {
        id: owned.id,
        name: owned.name,
        joinCode: owned.joinCode,
        itemListPushedAt: owned.itemListPushedAt?.toISOString() ?? null,
        members,
      },
      membership: null,
    };
  }

  const membership = await prisma.franchiseMember.findUnique({
    where: { tenantId },
    include: { franchiseGroup: { select: { name: true } } },
  });
  if (membership) {
    return {
      role: "member",
      group: null,
      membership: { rollupOptIn: membership.rollupOptIn, groupName: membership.franchiseGroup.name },
    };
  }

  return { role: "none", group: null, membership: null };
}

const createGroupSchema = z.object({ name: z.string().trim().min(1, "Group name is required") });

export async function createFranchiseGroup(input: { name: string }) {
  const session = await requireRole(["owner"]);
  const tenantId = session.user.tenantId;
  const parsed = createGroupSchema.parse(input);

  const [alreadyOwns, alreadyMember] = await Promise.all([
    prisma.franchiseGroup.findUnique({ where: { ownerTenantId: tenantId } }),
    prisma.franchiseMember.findUnique({ where: { tenantId } }),
  ]);
  if (alreadyOwns) throw new Error("This pharmacy already runs a franchise group.");
  if (alreadyMember) throw new Error("This pharmacy is already a member of a franchise group.");

  let joinCode = generateJoinCode();
  for (let attempt = 0; await prisma.franchiseGroup.findUnique({ where: { joinCode } }); attempt++) {
    if (attempt >= 20) throw new Error("Could not generate a unique join code — please try again.");
    joinCode = generateJoinCode();
  }

  const group = await prisma.franchiseGroup.create({
    data: { name: parsed.name, joinCode, ownerTenantId: tenantId },
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "franchise_group.create",
    entity: "FranchiseGroup",
    entityId: group.id,
    after: { name: parsed.name },
  });

  revalidatePath("/franchise");
  return { id: group.id, joinCode: group.joinCode };
}

const joinSchema = z.object({ joinCode: z.string().trim().toUpperCase().min(1) });

export async function joinFranchiseGroup(input: { joinCode: string }) {
  const session = await requireRole(["owner"]);
  const tenantId = session.user.tenantId;
  const parsed = joinSchema.parse(input);

  const [alreadyOwns, alreadyMember] = await Promise.all([
    prisma.franchiseGroup.findUnique({ where: { ownerTenantId: tenantId } }),
    prisma.franchiseMember.findUnique({ where: { tenantId } }),
  ]);
  if (alreadyOwns) throw new Error("A pharmacy that runs its own franchise group can't also join another.");
  if (alreadyMember) throw new Error("This pharmacy is already a member of a franchise group.");

  // The group being joined belongs to a *different* tenant — invisible to
  // this session's own RLS scope, so this one lookup (and only this one)
  // needs the bypass flag, the same "the joining party doesn't have
  // tenant context for the other side yet" bootstrapping problem the
  // customer portal's pre-login lookups solve the same way.
  const [, group] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.franchiseGroup.findUnique({ where: { joinCode: parsed.joinCode } }),
  ]);
  if (!group) throw new Error("Invalid join code.");
  if (group.ownerTenantId === tenantId) throw new Error("You can't join your own franchise group.");

  // Ordinary write, scoped by the extended client to this session's own
  // tenantId — joining is self-service, never something the franchisor
  // does on a member's behalf (see the migration's WITH CHECK policy).
  // ownerTenantId is copied from the group at join time — see the
  // FranchiseMember model comment for why it's denormalized here.
  await prisma.franchiseMember.create({
    data: { franchiseGroupId: group.id, tenantId, ownerTenantId: group.ownerTenantId },
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "franchise_member.join",
    entity: "FranchiseGroup",
    entityId: group.id,
    after: { groupName: group.name },
  });

  revalidatePath("/franchise");
  return { groupName: group.name };
}

export async function setRollupOptIn(enabled: boolean) {
  const session = await requireRole(["owner"]);
  const membership = await prisma.franchiseMember.findUnique({ where: { tenantId: session.user.tenantId } });
  if (!membership) throw new Error("This pharmacy is not a member of a franchise group.");

  await prisma.franchiseMember.update({ where: { id: membership.id }, data: { rollupOptIn: enabled } });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "franchise_member.set_rollup_opt_in",
    entity: "FranchiseGroup",
    entityId: membership.franchiseGroupId,
    after: { rollupOptIn: enabled },
  });

  revalidatePath("/franchise");
}

export async function leaveFranchiseGroup() {
  const session = await requireRole(["owner"]);
  const membership = await prisma.franchiseMember.findUnique({ where: { tenantId: session.user.tenantId } });
  if (!membership) throw new Error("This pharmacy is not a member of a franchise group.");

  await prisma.franchiseMember.delete({ where: { id: membership.id } });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "franchise_member.leave",
    entity: "FranchiseGroup",
    entityId: membership.franchiseGroupId,
  });

  revalidatePath("/franchise");
}

/** Franchisor-only: remove a member from the group it owns. */
export async function removeFranchiseMember(memberTenantId: string) {
  const session = await requireRole(["owner"]);
  const group = await prisma.franchiseGroup.findUnique({ where: { ownerTenantId: session.user.tenantId } });
  if (!group) throw new Error("This pharmacy does not run a franchise group.");

  const member = await prisma.franchiseMember.findFirst({
    where: { tenantId: memberTenantId, franchiseGroupId: group.id },
  });
  if (!member) throw new Error("Member not found in this group.");

  await prisma.franchiseMember.delete({ where: { id: member.id } });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "franchise_member.remove",
    entity: "FranchiseGroup",
    entityId: group.id,
    after: { removedTenantId: memberTenantId },
  });

  revalidatePath("/franchise");
}

export interface FranchiseRollupRow {
  tenantId: string;
  pharmacyName: string;
  revenue: number;
  margin: number;
  invoiceCount: number;
}

export interface FranchiseRollupReport {
  from: string;
  to: string;
  members: FranchiseRollupRow[];
  totalRevenue: number;
  totalMargin: number;
  totalInvoices: number;
}

/**
 * Franchisor-only cross-tenant read. Neither of the app's two existing
 * mechanisms fits this case: `tenantContext` + the extended `prisma`
 * client only ever resolves tenant identity implicitly (via AsyncLocalStorage,
 * which proved unreliable specifically when called from inside a Server
 * Component's render — see the git history for this file if curious), and
 * the Super-Admin console's RLS-bypass is gated by a completely separate
 * admin session, not an ordinary owner session. So this loops over the
 * group's opted-in members one at a time, using `basePrisma` (the
 * unextended client) with an *explicit* `set_config('app.current_tenant_id',
 * memberId, true)` batched in the same `$transaction([...])` as the query
 * — the same low-level, unambiguous mechanism every pre-tenant-context
 * lookup elsewhere in this app already relies on (see
 * src/lib/actions/customer-portal.ts, src/lib/actions/admin.ts). RLS is
 * still enforced by Postgres itself regardless of which client wrapper
 * issues the query — this is a real, legitimate RLS-scoped read as that
 * member tenant, authorized by the member's own explicit rollupOptIn, not
 * a bypass. Only aggregate SUM/COUNT numbers ever cross back into the
 * franchisor's session — no per-invoice or per-item detail leaves the
 * member tenant.
 */
export async function getFranchiseRollupReport(from: string, to: string): Promise<FranchiseRollupReport> {
  const session = await requireRole(["owner"]);
  const group = await prisma.franchiseGroup.findUnique({
    where: { ownerTenantId: session.user.tenantId },
    include: { members: { where: { rollupOptIn: true } } },
  });
  if (!group) throw new Error("This pharmacy does not run a franchise group.");

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const members: FranchiseRollupRow[] = [];
  for (const member of group.members) {
    const [, lines] = await basePrisma.$transaction([
      basePrisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${member.tenantId}, true)`,
      basePrisma.salesInvoiceItem.findMany({
        where: {
          invoice: { tenantId: member.tenantId, status: "completed", invoiceDate: { gte: fromDate, lte: toDate } },
        },
        select: {
          qty: true,
          rate: true,
          discountAmount: true,
          batch: { select: { purchaseRate: true } },
          invoiceId: true,
        },
      }),
    ]);
    let revenue = 0;
    let cost = 0;
    const invoiceIds = new Set<string>();
    for (const line of lines) {
      revenue += line.qty * Number(line.rate) - Number(line.discountAmount);
      cost += line.qty * Number(line.batch.purchaseRate);
      invoiceIds.add(line.invoiceId);
    }
    members.push({
      tenantId: member.tenantId,
      pharmacyName: await getTenantPharmacyName(member.tenantId),
      revenue: round2(revenue),
      margin: round2(revenue - cost),
      invoiceCount: invoiceIds.size,
    });
  }

  return {
    from,
    to,
    members,
    totalRevenue: round2(members.reduce((s, m) => s + m.revenue, 0)),
    totalMargin: round2(members.reduce((s, m) => s + m.margin, 0)),
    totalInvoices: members.reduce((s, m) => s + m.invoiceCount, 0),
  };
}

export interface ItemListPushResult {
  memberCount: number;
  itemsCreated: number;
  itemsUpdated: number;
}

/**
 * Franchisor-only, on-demand (not an ongoing feed): pushes the
 * franchisor's own item catalog to every current member — name, generic
 * name, HSN code, and tax rate only, deliberately never stock or pricing
 * (a batch/rate is a per-branch operational decision each member makes
 * for itself). Re-runnable any time the franchisor wants members back in
 * sync; each run just re-applies the franchisor's current catalog.
 */
export async function pushStandardizedItemList(): Promise<ItemListPushResult> {
  const session = await requireRole(["owner"]);
  const group = await prisma.franchiseGroup.findUnique({
    where: { ownerTenantId: session.user.tenantId },
    include: { members: true },
  });
  if (!group) throw new Error("This pharmacy does not run a franchise group.");
  if (group.members.length === 0) throw new Error("This franchise group has no members yet.");

  const sourceItems = await prisma.item.findMany({
    where: { tenantId: session.user.tenantId },
    select: { name: true, genericName: true, hsnCode: true, taxRate: true },
  });
  if (sourceItems.length === 0) throw new Error("This pharmacy has no items to push yet.");

  let itemsCreated = 0;
  let itemsUpdated = 0;

  // Same explicit basePrisma + set_config approach as the rollup report
  // above, for the same reason — see that function's doc comment.
  for (const member of group.members) {
    const [, existing] = await basePrisma.$transaction([
      basePrisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${member.tenantId}, true)`,
      basePrisma.item.findMany({
        where: { tenantId: member.tenantId, name: { in: sourceItems.map((i) => i.name), mode: "insensitive" } },
        select: { id: true, name: true },
      }),
    ]);
    const existingByName = new Map(existing.map((i) => [i.name.toLowerCase(), i]));

    const itemOps: ReturnType<typeof basePrisma.item.update>[] = [];
    for (const source of sourceItems) {
      const match = existingByName.get(source.name.toLowerCase());
      const data = {
        genericName: source.genericName,
        hsnCode: source.hsnCode,
        taxRate: source.taxRate,
      };
      if (match) {
        itemOps.push(basePrisma.item.update({ where: { id: match.id }, data }));
        itemsUpdated++;
      } else {
        itemOps.push(basePrisma.item.create({ data: { tenantId: member.tenantId, name: source.name, ...data } }));
        itemsCreated++;
      }
    }
    await basePrisma.$transaction([
      basePrisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${member.tenantId}, true)`,
      ...itemOps,
    ]);
  }

  await prisma.franchiseGroup.update({ where: { id: group.id }, data: { itemListPushedAt: new Date() } });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "franchise_group.push_item_list",
    entity: "FranchiseGroup",
    entityId: group.id,
    after: { memberCount: group.members.length, itemsCreated, itemsUpdated },
  });

  revalidatePath("/franchise");
  return { memberCount: group.members.length, itemsCreated, itemsUpdated };
}
