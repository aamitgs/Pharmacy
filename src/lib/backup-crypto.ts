import "server-only";
import crypto from "node:crypto";

// Backup format: [12-byte IV][16-byte auth tag][ciphertext], AES-256-GCM.
// BACKUP_ENCRYPTION_KEY is a 32-byte key, hex or base64 encoded.

/**
 * Payload schema version, bumped whenever the shape of the decrypted JSON
 * changes, so scripts/restore-backup.ts can refuse a file it doesn't
 * understand instead of half-restoring it.
 *
 * v1 — the original 7-collection export (tenant, branches, items, batches,
 *      customers, doctors, invoices-with-nested-items). Incomplete: it
 *      silently omitted 45 of the 52 tables, including the purchase ledger,
 *      staff accounts, customer credit balances, the statutory narcotic
 *      register, cold-chain logs and the audit trail. v1 files carry no
 *      schemaVersion field at all, which is how the restore detects them.
 * v2 — every tenant-scoped table, flat (one array per model, children no
 *      longer nested inside parents) so a restore can insert in a
 *      deterministic FK-safe order without unwrapping.
 *
 * Lives here rather than in actions/backup.ts because that file is
 * `"use server"`, where only async functions may be exported — a plain
 * const there breaks the build, and marking this async would publish it as
 * a needless RPC endpoint.
 */
export const BACKUP_SCHEMA_VERSION = 2;

/** Decimal columns serialize as strings via their own toJSON; BigInt has no
 * toJSON and would otherwise throw. Shared by all three backup paths. */
export function serializeBackup(data: unknown): string {
  return JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
}

function loadKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) throw new Error("BACKUP_ENCRYPTION_KEY is not configured");
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export function encryptBackup(plaintext: string): Buffer {
  const key = loadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptBackup(payload: Buffer): string {
  const key = loadKey();
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
