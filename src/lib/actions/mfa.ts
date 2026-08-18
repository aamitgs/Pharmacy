"use server";

import QRCode from "qrcode";
import { requireSession } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { generateTotpSecret, totpUri, verifyTotpCode } from "@/lib/totp";
import { encryptSecret, decryptSecret, isEncryptedSecret } from "@/lib/secret-crypto";
import { writeAuditLog } from "@/lib/audit";

export async function startMfaSetup() {
  const session = await requireSession();

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  if (user.totpEnabled) {
    return { alreadyEnabled: true as const };
  }

  // Reuse a pending secret if setup was started but never confirmed, so a
  // reload does not invalidate a code the user has already scanned. Stored
  // encrypted; a pending secret left over from before encryption existed is
  // re-written encrypted here rather than left in plaintext.
  const existing = user.totpSecret ? decryptSecret(user.totpSecret) : null;
  const secret = existing ?? generateTotpSecret();
  if (!user.totpSecret || !isEncryptedSecret(user.totpSecret)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: encryptSecret(secret) },
    });
  }

  const uri = totpUri(secret, `${user.email}`);
  const qrDataUrl = await QRCode.toDataURL(uri);

  // The plaintext secret is returned to the user's own browser on purpose —
  // they have to scan or type it into an authenticator app. It is never
  // written to the database in this form.
  return { alreadyEnabled: false as const, secret, qrDataUrl };
}

export async function confirmMfaSetup(code: string) {
  const session = await requireSession();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  if (!user.totpSecret) {
    return { ok: false as const, error: "No pending MFA setup. Start again." };
  }
  if (!verifyTotpCode(decryptSecret(user.totpSecret), code)) {
    return { ok: false as const, error: "Invalid code. Check your authenticator app and try again." };
  }

  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: "mfa.enabled",
    entity: "User",
    entityId: user.id,
    before: { totpEnabled: false },
    after: { totpEnabled: true },
  });

  return { ok: true as const };
}
