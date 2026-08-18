import "server-only";
import { encryptBackup, decryptBackup } from "@/lib/backup-crypto";

/**
 * Encryption at rest for reversible secrets stored in the database.
 *
 * Some secrets cannot be hashed the way passwords are, because the server has
 * to recover the original value to use it: a TOTP shared secret is needed to
 * derive the expected 6-digit code, and an OAuth refresh token is needed to
 * mint a new access token. Those get encrypted instead.
 *
 * Uses the same AES-256-GCM primitive and `BACKUP_ENCRYPTION_KEY` as backup
 * files — the pattern `CloudBackupConnection.accessTokenEnc`/`refreshTokenEnc`
 * already established. Sharing the key adds no exposure: backups already carry
 * these same fields, so anything that can read a backup could already read them.
 *
 * Consequence worth knowing: a database restored onto a system with a
 * different `BACKUP_ENCRYPTION_KEY` cannot decrypt these values. TOTP enrolment
 * would need redoing and cloud-backup destinations reconnecting. Keep the key
 * with the data it protects.
 *
 * Stored form is `enc.v1:<base64>`. The prefix does two jobs:
 *  - distinguishes an encrypted value from a legacy plaintext one during
 *    rollout, so a deploy does not lock every MFA user out before
 *    `scripts/encrypt-totp-secrets.ts` has run;
 *  - versions the format, so a future key rotation or algorithm change can be
 *    told apart from what came before.
 * A base32 TOTP secret is `[A-Z2-7]+`, so it can never collide with the prefix.
 */
const PREFIX = "enc.v1:";

export function encryptSecret(plaintext: string): string {
  return PREFIX + encryptBackup(plaintext).toString("base64");
}

/** True if `stored` is already encrypted (vs. a legacy plaintext value). */
export function isEncryptedSecret(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/**
 * Returns the usable secret. A value written before encryption existed is
 * returned as-is so it keeps working until the migration script re-writes it.
 */
export function decryptSecret(stored: string): string {
  if (!isEncryptedSecret(stored)) return stored;
  return decryptBackup(Buffer.from(stored.slice(PREFIX.length), "base64"));
}
