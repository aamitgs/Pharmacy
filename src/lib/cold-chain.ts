// Standard vaccine/pharma cold-chain range — fixed, not a per-tenant
// setting, matching the rest of Alerts' "explainable, no configuration
// needed" defaults (see src/lib/actions/alerts.ts). Kept out of
// temperature-logs.ts because a "use server" file may only export async
// functions — a plain constant export breaks Next's server-action bundling.
export const COLD_CHAIN_MIN_C = 2;
export const COLD_CHAIN_MAX_C = 8;

export function isColdChainOutOfRange(temperatureCelsius: number): boolean {
  return temperatureCelsius < COLD_CHAIN_MIN_C || temperatureCelsius > COLD_CHAIN_MAX_C;
}
