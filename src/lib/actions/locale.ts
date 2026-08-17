"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { isSupportedLocale } from "@/i18n/locales";

/**
 * Per-user language preference (Phase 10.1) — deliberately independent of
 * the tenant's own settings, so each staff member on a shared counter can
 * pick their own. Persisted on `User.locale` (the durable source of truth,
 * read by src/i18n/request.ts) rather than a cookie, so it follows the
 * user across devices/logins; the cookie set here only covers the brief
 * window before the layout re-renders with the DB value, and is also the
 * fallback used for pre-login pages (login/signup) that have no session.
 */
export async function setUserLocale(locale: string) {
  if (!isSupportedLocale(locale)) throw new Error("Unsupported locale");
  const session = await requireSession();

  await prisma.user.update({ where: { id: session.user.id }, data: { locale } });

  const store = await cookies();
  store.set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  revalidatePath("/", "layout");
}
