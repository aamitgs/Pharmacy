// Plain, framework/server-agnostic locale constants — safe to import from
// both Client Components and server code. Kept separate from request.ts
// (which pulls in Prisma/auth to resolve the *current* locale) because a
// Client Component importing anything from that file would otherwise drag
// the whole server-only dependency graph (pg, Prisma) into the browser
// bundle — confirmed the hard way via a `next build` failure ("Module not
// found: Can't resolve 'net'/'tls'") the first time SUPPORTED_LOCALES was
// re-exported from request.ts itself.
export const SUPPORTED_LOCALES = ["en", "hi"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "en";

export function isSupportedLocale(value: string | undefined | null): value is AppLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
