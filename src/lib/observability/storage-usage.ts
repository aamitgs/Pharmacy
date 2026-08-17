import "server-only";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Phase 11.3: real on-disk bytes for a tenant's prescription-image
 * uploads (src/lib/prescription-storage.ts writes them under
 * <STORAGE_ROOT>/<tenantId>/) — not an estimate. This app's documented
 * single-process self-hosted deployment means local disk is the actual
 * storage backend, so this is a meaningful "storage used" number, not
 * just a stand-in metric.
 */
const STORAGE_ROOT = process.env.PRESCRIPTION_STORAGE_DIR
  ? path.resolve(process.env.PRESCRIPTION_STORAGE_DIR)
  : path.join(process.cwd(), "storage", "prescriptions");

export async function getTenantStorageBytes(tenantId: string): Promise<number> {
  const tenantDir = path.join(STORAGE_ROOT, tenantId);
  try {
    const entries = await readdir(tenantDir, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const stats = await stat(path.join(tenantDir, entry.name));
      total += stats.size;
    }
    return total;
  } catch {
    // No directory yet — a tenant that's never uploaded a prescription
    // photo, not an error.
    return 0;
  }
}
