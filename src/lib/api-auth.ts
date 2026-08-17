import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";

const KEY_PREFIX = "phk_";

export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(24).toString("base64url");
  const plaintext = `${KEY_PREFIX}${random}`;
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash, prefix: plaintext.slice(0, 10) };
}

function hashKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

export class ApiAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

/**
 * Resolves the calling tenant from an `Authorization: Bearer <key>` header.
 * Runs against the unextended base client with the bypass flag, scoped to
 * this one lookup transaction — the API key IS the tenant-context bootstrap
 * here, the same "legitimate pre-tenant-context" case as the login lookup.
 */
export async function authenticateApiRequest(req: Request): Promise<{ tenantId: string; apiKeyId: string }> {
  const auth = req.headers.get("authorization");
  const key = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  if (!key) throw new ApiAuthError("Missing Authorization: Bearer <api key> header", 401);

  const hash = hashKey(key);
  const [, apiKey] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.apiKey.findUnique({
      where: { keyHash: hash },
      include: { tenant: { include: { subscription: { include: { plan: true } } } } },
    }),
  ]);

  if (!apiKey || apiKey.revokedAt) throw new ApiAuthError("Invalid or revoked API key", 401);
  if (apiKey.tenant.suspendedAt) throw new ApiAuthError("This account has been suspended", 403);
  if (!apiKey.tenant.subscription?.plan.publicApiAccess) {
    throw new ApiAuthError("Your plan does not include public API access — upgrade in Settings > Billing", 403);
  }

  checkRateLimit(apiKey.id);

  await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.rls_bypass', 'true', true)`,
    basePrisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
    }),
  ]);

  return { tenantId: apiKey.tenantId, apiKeyId: apiKey.id };
}

// Simple in-memory sliding-window limiter, per API key. This is a
// single-instance limit — accurate for this app's documented single-process
// self-hosted deployment (see README's scaling notes), but would need a
// shared store (Redis etc.) behind a load balancer with multiple instances.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const requestLog = new Map<string, number[]>();

function checkRateLimit(apiKeyId: string): void {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (requestLog.get(apiKeyId) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    throw new ApiAuthError(`Rate limit exceeded — max ${RATE_LIMIT_MAX_REQUESTS} requests/minute`, 429);
  }
  timestamps.push(now);
  requestLog.set(apiKeyId, timestamps);
}

export function apiErrorResponse(e: unknown): NextResponse {
  if (e instanceof ApiAuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const message = e instanceof Error ? e.message : "Internal error";
  return NextResponse.json({ error: message }, { status: 400 });
}
