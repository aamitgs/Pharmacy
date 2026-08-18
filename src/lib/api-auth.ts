import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import type { ApiScope } from "@/lib/api-scopes";

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
 * Resolves the calling tenant from an `Authorization: Bearer <key>` header
 * and checks the key carries `requiredScope`.
 *
 * Runs against the unextended base client with the bypass flag, scoped to
 * this one lookup transaction — the API key IS the tenant-context bootstrap
 * here, the same "legitimate pre-tenant-context" case as the login lookup.
 *
 * `requiredScope` is mandatory rather than optional-with-a-default so that
 * adding a route without deciding what it grants is a type error, not a
 * silently unguarded endpoint. That is the whole reason scoping is enforced
 * here instead of in each route body.
 */
export async function authenticateApiRequest(
  req: Request,
  requiredScope: ApiScope
): Promise<{ tenantId: string; apiKeyId: string }> {
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

  // 403, not 404: the key is valid and the caller is entitled to know their
  // key is simply too narrow, so they fix the key rather than chase a
  // phantom missing endpoint. It names the scope for the same reason —
  // withholding it hides nothing, since the scope list is public in the
  // OpenAPI spec and in Settings.
  if (!apiKey.scopes.includes(requiredScope)) {
    throw new ApiAuthError(
      `This API key does not have the "${requiredScope}" scope. Create a key with that scope in Settings > API.`,
      403
    );
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
