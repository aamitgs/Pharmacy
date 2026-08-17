// "server-only" is a Next.js build-time guard (throws if a client bundle
// imports it) with no runtime behavior of its own — Vitest isn't a Next.js
// build, so vitest.config.ts aliases the real package to this no-op here.
export {};
