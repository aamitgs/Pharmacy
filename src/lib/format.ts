import type { AppLocale } from "@/i18n/locales";

// Both locales use Indian digit grouping (lakh/crore, e.g. 12,34,567) and
// Arabic numerals — `numberingSystem: "latn"` is pinned explicitly rather
// than left to hi-IN's ICU default, since some ICU builds render Devanagari
// digits for hi-IN by default, which would be wrong here: Indian retail
// receipts/prices use Arabic numerals even in Hindi-language UI, only the
// month/weekday names actually change with locale.
const INTL_LOCALE: Record<AppLocale, string> = { en: "en-IN", hi: "hi-IN" };

export function formatCurrency(amount: number, locale: AppLocale = "en"): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency: "INR",
    numberingSystem: "latn",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(value: number, locale: AppLocale = "en", options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { numberingSystem: "latn", ...options }).format(value);
}

export function formatDate(date: Date | string, locale: AppLocale = "en"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    numberingSystem: "latn",
  }).format(d);
}

export function formatDateTime(date: Date | string, locale: AppLocale = "en"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    numberingSystem: "latn",
  }).format(d);
}
