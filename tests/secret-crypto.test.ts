import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, isEncryptedSecret } from "@/lib/secret-crypto";
import { generateTotpSecret, totpUri, verifyTotpCode } from "@/lib/totp";

/**
 * TOTP secrets used to sit in the database as plaintext base32. They cannot be
 * hashed like a password — the server has to recover the original value to
 * derive the expected code — so they are encrypted at rest instead.
 *
 * What these tests are really protecting: a stolen database dump must not hand
 * an attacker working MFA secrets, and the rollout must not lock out users
 * whose secrets have not been migrated yet.
 */

describe("encryption at rest for reversible secrets", () => {
  it("round-trips a value unchanged", () => {
    const secret = generateTotpSecret();
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("does not leave the plaintext anywhere in the stored value", () => {
    const secret = generateTotpSecret();
    const stored = encryptSecret(secret);
    expect(stored).not.toContain(secret);
    // ...nor any recognisable run of it.
    expect(stored).not.toContain(secret.slice(0, 8));
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const secret = generateTotpSecret();
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    expect(a).not.toBe(b);
    // Both must still decrypt to the same secret.
    expect(decryptSecret(a)).toBe(secret);
    expect(decryptSecret(b)).toBe(secret);
  });

  it("tags stored values with a version prefix", () => {
    const stored = encryptSecret(generateTotpSecret());
    expect(stored.startsWith("enc.v1:")).toBe(true);
    expect(isEncryptedSecret(stored)).toBe(true);
  });

  it("rejects a tampered ciphertext instead of returning garbage", () => {
    // GCM authenticates; flipping a bit must throw, not silently decrypt.
    const stored = encryptSecret(generateTotpSecret());
    const tampered = stored.slice(0, -2) + (stored.endsWith("A") ? "B" : "A") + "=";
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("handles an empty string without throwing", () => {
    expect(decryptSecret(encryptSecret(""))).toBe("");
  });
});

describe("rollout compatibility with pre-encryption rows", () => {
  it("passes a legacy plaintext secret through unchanged", () => {
    // Until scripts/encrypt-totp-secrets.ts has run, existing rows hold raw
    // base32. Those users must still be able to log in.
    const legacy = "HJKDMUVRHHXP2SNRDLVFUAHJXDD7HMSS";
    expect(isEncryptedSecret(legacy)).toBe(false);
    expect(decryptSecret(legacy)).toBe(legacy);
  });

  it("never mistakes a base32 secret for an encrypted one", () => {
    // Base32 is [A-Z2-7]; the prefix contains '.', ':' and lowercase, so the
    // two alphabets cannot collide however many secrets are generated.
    for (let i = 0; i < 200; i++) {
      const secret = generateTotpSecret();
      expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
      expect(isEncryptedSecret(secret)).toBe(false);
    }
  });

  it("is idempotent-safe: re-encrypting an encrypted value is detectable", () => {
    // The migration script skips anything already prefixed, so double
    // encryption cannot happen — but if it ever did, it would still round-trip
    // rather than corrupt, and the inner value stays recoverable.
    const secret = generateTotpSecret();
    const once = encryptSecret(secret);
    expect(isEncryptedSecret(once)).toBe(true);
    const twice = encryptSecret(once);
    expect(decryptSecret(twice)).toBe(once);
    expect(decryptSecret(decryptSecret(twice))).toBe(secret);
  });
});

describe("an encrypted secret still drives working MFA", () => {
  it("verifies a code derived from the decrypted secret", () => {
    const secret = generateTotpSecret();
    const stored = encryptSecret(secret);

    // Simulates the login path: read the stored value, decrypt, verify.
    const code = currentCode(secret);
    expect(verifyTotpCode(decryptSecret(stored), code)).toBe(true);
  });

  it("still rejects a wrong code", () => {
    const secret = generateTotpSecret();
    const stored = encryptSecret(secret);
    expect(verifyTotpCode(decryptSecret(stored), "000000")).toBe(false);
  });

  it("produces an otpauth URI from the decrypted secret", () => {
    const secret = generateTotpSecret();
    const uri = totpUri(decryptSecret(encryptSecret(secret)), "user@example.test");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain(secret); // the QR must carry the real secret
  });
});

/** Derives the code an authenticator app would currently show. */
function currentCode(secretBase32: string): string {
  // Uses the same library the app does, via its own verify window, by
  // brute-checking the small set the verifier accepts would be fragile — so
  // generate directly with otpauth, matching src/lib/totp.ts's parameters.
  const OTPAuth = require("otpauth");
  return new OTPAuth.TOTP({
    issuer: "Pharmacy",
    label: "verify",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  }).generate();
}
