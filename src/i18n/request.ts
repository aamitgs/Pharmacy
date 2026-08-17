import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, isSupportedLocale, type AppLocale } from "@/i18n/locales";

export { SUPPORTED_LOCALES, DEFAULT_LOCALE, isSupportedLocale } from "@/i18n/locales";
export type { AppLocale } from "@/i18n/locales";

/**
 * Locale resolution, in priority order:
 *  1. The signed-in tenant user's own `User.locale` (per-user preference,
 *     independent of tenant settings — a staff member's choice follows
 *     them across devices). Resolved the same "ambient, auth()-backed"
 *     way every other RSC read in this app already resolves its tenant —
 *     no tenantContext override involved, so none of the AsyncLocalStorage
 *     unreliability from the franchise rollup lesson applies here.
 *  2. The `NEXT_LOCALE` cookie, for pages with no tenant session yet
 *     (login, signup, the customer portal, public feedback links).
 *  3. The default locale.
 */
export default getRequestConfig(async () => {
  let locale: AppLocale = DEFAULT_LOCALE;

  const session = await auth();
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { locale: true } });
    if (isSupportedLocale(user?.locale)) locale = user.locale;
  } else {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
    if (isSupportedLocale(cookieLocale)) locale = cookieLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
