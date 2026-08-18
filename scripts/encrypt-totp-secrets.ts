import "dotenv/config";
import crypto from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * One-shot migration: encrypts any TOTP secret still stored in plaintext.
 *
 *   npx tsx scripts/encrypt-totp-secrets.ts [--dry-run]
 *
 * TOTP secrets used to be written to `users.totpSecret` as plaintext base32.
 * They cannot be hashed — the server needs the original value to derive the
 * expected code — so they are encrypted at rest instead, in the same
 * `enc.v1:<base64>` AES-256-GCM form as the cloud-backup OAuth tokens.
 *
 * Safe to run repeatedly: values already carrying the `enc.v1:` prefix are
 * skipped. The application reads both forms, so running this is not urgent
 * for uptime — but until it runs, existing secrets stay in plaintext and a
 * stolen database dump still defeats MFA.
 *
 * This is deliberately a script rather than a Prisma migration: AES-GCM is
 * not available to `prisma migrate`'s SQL (pgcrypto's `encrypt()` offers only
 * CBC/ECB), so the transform has to happen in application code.
 *
 * Cannot be undone without the key — `BACKUP_ENCRYPTION_KEY` must be the same
 * one the application will run with, or MFA users will have to re-enrol.
 */

const PREFIX = "enc.v1:";

function loadKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) throw new Error("BACKUP_ENCRYPTION_KEY is not configured");
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  loadKey(); // fail fast on a missing/!32-byte key before touching any rows

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', false)`;

    const users = await prisma.user.findMany({
      where: { totpSecret: { not: null } },
      select: { id: true, email: true, totpSecret: true },
    });

    const plaintext = users.filter((u) => !u.totpSecret!.startsWith(PREFIX));
    console.log(`${users.length} user(s) with a TOTP secret; ${plaintext.length} still plaintext.`);

    if (plaintext.length === 0) {
      console.log("Nothing to do.");
      return;
    }
    if (dryRun) {
      for (const u of plaintext) console.log(`  would encrypt: ${u.email}`);
      console.log("\n--dry-run: nothing written.");
      return;
    }

    // One transaction: either every secret is encrypted or none is, so a
    // failure part-way cannot leave the table in a mixed, half-migrated state
    // that is harder to reason about than either end state.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`;
      for (const u of plaintext) {
        await tx.user.update({
          where: { id: u.id },
          data: { totpSecret: encryptSecret(u.totpSecret!) },
        });
      }
    });

    console.log(`Encrypted ${plaintext.length} TOTP secret(s).`);
    for (const u of plaintext) console.log(`  ${u.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nFAILED — no secrets were changed.");
  console.error(e);
  process.exit(1);
});
