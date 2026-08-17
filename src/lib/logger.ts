import "server-only";
import pino from "pino";

/**
 * Phase 11.2: structured operational logging — deliberately separate from
 * AuditLog (src/lib/audit.ts), which remains the business-facing,
 * compliance-grade "who did what" record. This is for debugging a
 * production incident (which tenant, which action, what went wrong), not
 * a record anyone should rely on for compliance purposes.
 *
 * Plain JSON output always, no in-process pino-pretty transport — pino's
 * transport mechanism spawns a worker thread that loads its target module
 * by filesystem path, which doesn't survive being bundled through
 * Turbopack/webpack reliably. Pipe stdout through the `pino-pretty` CLI
 * locally instead (`npm run dev | npx pino-pretty`) if you want colorized
 * output — see the README.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  timestamp: pino.stdTimeFunctions.isoTime,
});

export interface LogContext {
  tenantId?: string;
  userId?: string;
  action: string;
  [key: string]: unknown;
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { message: error.message, name: error.name, stack: error.stack };
  return error;
}

export function logError(message: string, context: LogContext, error?: unknown) {
  logger.error({ ...context, err: serializeError(error) }, message);
}

export function logWarn(message: string, context: LogContext) {
  logger.warn(context, message);
}

export function logInfo(message: string, context: LogContext) {
  logger.info(context, message);
}
