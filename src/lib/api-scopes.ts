/**
 * Scopes for public API keys.
 *
 * Before these existed a key was all-or-nothing: the same credential handed
 * to an accountant's read-only reporting script could also call
 * `POST /v1/sales`, which decrements batch stock and creates invoices. A key
 * lives in someone else's config file or CI secret store, so the blast radius
 * of one leaking should be the job it was issued for, not the whole tenant.
 *
 * Named `resource:action`. Read and write are separate scopes rather than a
 * single "access" flag per resource, because almost every integration needs
 * one and not the other — that asymmetry is the point.
 */

export const API_SCOPES = [
  "stock:read",
  "customers:read",
  "invoices:read",
  "sales:write",
  "wards:read",
  "admissions:read",
  "admissions:write",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/** Shown in Settings → API when choosing what a new key may do. */
export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  "stock:read": "Read stock levels and batches",
  "customers:read": "Read the customer list",
  "invoices:read": "Read sales invoices",
  "sales:write": "Create sales (decrements stock)",
  "wards:read": "Read ward stock and consumption (hospital mode)",
  "admissions:read": "Read patient admissions (hospital mode)",
  "admissions:write": "Create patient admissions (hospital mode)",
};

/**
 * Scopes that let a key change data. Surfaced separately so the UI can warn
 * about them rather than presenting a stock read and an invoice write as
 * equivalent checkboxes.
 */
export const WRITE_SCOPES: readonly ApiScope[] = ["sales:write", "admissions:write"];

export function isWriteScope(scope: string): boolean {
  return (WRITE_SCOPES as readonly string[]).includes(scope);
}

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}
