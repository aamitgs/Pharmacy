import "server-only";

import { prisma, tenantContext } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/provider";

// A purchase habit needs at least two data points to have an interval at
// all — a single purchase has nothing to project a cycle from.
const MIN_PURCHASES = 2;
// Send up to this many days *before* the projected date, so the reminder
// lands ahead of the customer actually running out.
const LEAD_DAYS = 3;
// Once the projected date is this far in the past, treat the prediction as
// stale (they likely refilled elsewhere, or stopped taking it) rather than
// sending an reminder that's now just noise.
const STALE_DAYS = 14;
const LOOKBACK_DAYS = 365;

interface PurchaseCycle {
  customerId: string;
  customerName: string;
  phone: string | null;
  itemId: string;
  itemName: string;
  lastPurchaseDate: Date;
  expectedDate: Date;
  avgIntervalDays: number;
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Groups a tenant's completed sales by (customerId, itemId) for opted-in
 * customers, and projects a next-expected-purchase date from the average
 * interval between past purchases of that same item. Explainable by
 * design, same as the reorder-suggestion math in alerts.ts — no black-box
 * scoring, just "you usually buy this every N days, last bought M days
 * ago."
 */
async function findDuePurchaseCycles(tenantId: string, now: Date): Promise<PurchaseCycle[]> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const lines = await prisma.salesInvoiceItem.findMany({
    where: {
      invoice: {
        tenantId,
        status: "completed",
        invoiceDate: { gte: since, lte: now },
        customer: { refillRemindersOptIn: true },
      },
    },
    select: {
      itemId: true,
      item: { select: { name: true } },
      invoice: {
        select: {
          invoiceDate: true,
          customerId: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      },
    },
  });

  const byPair = new Map<string, { customerId: string; customerName: string; phone: string | null; itemId: string; itemName: string; dates: Date[] }>();
  for (const line of lines) {
    const customerId = line.invoice.customerId;
    if (!customerId || !line.invoice.customer) continue;
    const key = `${customerId}:${line.itemId}`;
    const entry = byPair.get(key) ?? {
      customerId,
      customerName: line.invoice.customer.name,
      phone: line.invoice.customer.phone,
      itemId: line.itemId,
      itemName: line.item.name,
      dates: [],
    };
    entry.dates.push(line.invoice.invoiceDate);
    byPair.set(key, entry);
  }

  const cycles: PurchaseCycle[] = [];
  for (const entry of byPair.values()) {
    if (entry.dates.length < MIN_PURCHASES) continue;
    const dates = entry.dates.sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) intervals.push(daysBetween(dates[i - 1], dates[i]));
    const avgIntervalDays = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
    if (avgIntervalDays <= 0) continue;

    const lastPurchaseDate = dates[dates.length - 1];
    const expectedDate = new Date(lastPurchaseDate.getTime() + avgIntervalDays * 24 * 60 * 60 * 1000);

    const daysUntilExpected = daysBetween(now, expectedDate);
    const isDue = daysUntilExpected <= LEAD_DAYS && daysUntilExpected >= -STALE_DAYS;
    if (!isDue) continue;

    cycles.push({
      customerId: entry.customerId,
      customerName: entry.customerName,
      phone: entry.phone,
      itemId: entry.itemId,
      itemName: entry.itemName,
      lastPurchaseDate,
      expectedDate,
      avgIntervalDays: Math.round(avgIntervalDays),
    });
  }
  return cycles;
}

export interface RefillReminderRunResult {
  checked: number;
  sent: number;
  failed: number;
  skippedNoPhone: number;
}

/**
 * Runs refill-reminder detection + delivery for one tenant. Reused by both
 * the owner's "Send now" action (single tenant, on demand) and the
 * scheduled cron route (every enabled tenant). Must be called from inside
 * tenantContext.run({ tenantId }, ...) — same convention as every other
 * tenant-scoped action, so RLS actually applies to every query it runs.
 */
export async function runRefillRemindersForTenant(tenantId: string): Promise<RefillReminderRunResult> {
  return tenantContext.run({ tenantId }, async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (!tenant.refillRemindersEnabled) {
      return { checked: 0, sent: 0, failed: 0, skippedNoPhone: 0 };
    }

    const now = new Date();
    const cycles = await findDuePurchaseCycles(tenantId, now);

    const result: RefillReminderRunResult = { checked: cycles.length, sent: 0, failed: 0, skippedNoPhone: 0 };

    for (const cycle of cycles) {
      // Already handled this exact purchase cycle (same anchor purchase) —
      // skip regardless of whether the prior attempt succeeded or failed,
      // so a failed send (e.g. WhatsApp not configured) doesn't retry every
      // single scheduled run.
      const existing = await prisma.refillReminder.findUnique({
        where: {
          customerId_itemId_lastPurchaseDate: {
            customerId: cycle.customerId,
            itemId: cycle.itemId,
            lastPurchaseDate: cycle.lastPurchaseDate,
          },
        },
      });
      if (existing) continue;

      if (!cycle.phone) {
        result.skippedNoPhone++;
        continue;
      }

      const text = [
        `*${tenant.pharmacyName}*`,
        `Hi ${cycle.customerName}, this is a reminder from us.`,
        "",
        `You usually reorder *${cycle.itemName}* about every ${cycle.avgIntervalDays} days, and it's been a while since your last purchase — you may be due for a refill soon.`,
        "",
        "Reply to this message or visit us to restock.",
      ].join("\n");

      const sendResult = await sendWhatsAppMessage({ to: cycle.phone, text });

      await prisma.whatsAppLog.create({
        data: {
          tenantId,
          customerId: cycle.customerId,
          invoiceId: null,
          phone: cycle.phone,
          messageType: "reminder",
          status: sendResult.success ? "sent" : "failed",
          note: sendResult.note,
        },
      });

      await prisma.refillReminder.create({
        data: {
          tenantId,
          customerId: cycle.customerId,
          itemId: cycle.itemId,
          lastPurchaseDate: cycle.lastPurchaseDate,
          expectedDate: cycle.expectedDate,
          status: sendResult.success ? "sent" : "failed",
        },
      });

      if (sendResult.success) result.sent++;
      else result.failed++;
    }

    return result;
  });
}
