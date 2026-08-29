import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

export type SecurityAction =
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGOUT'
  | 'AUTH_FORBIDDEN'
  | 'AUTH_TOKEN_INVALID'
  | 'SECURITY_EVENT';

export interface SecurityAuditInput {
  action: SecurityAction | string;
  userId?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Durable, best-effort security audit log. A write failure is logged but never
 * thrown — security logging must never break the request that triggered it.
 */
export async function recordSecurityEvent(input: SecurityAuditInput): Promise<void> {
  try {
    await prisma.securityAudit.create({
      data: {
        action: input.action,
        userId: input.userId ?? null,
        email: input.email ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metadata: (input.metadata as object) ?? undefined,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, action: input.action }, 'Failed to write security audit');
  }
}
