import { createHmac } from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

/**
 * Thin n8n webhook client.
 *
 * TaskFlow integrates with a user-hosted n8n instance by firing webhooks for
 * selected server-side events (agentic decisions, supply-chain transitions).
 * This is a fire-and-forget, best-effort integration: a failed delivery is
 * logged and swallowed so it NEVER breaks the primary request path.
 *
 * Configuration (server-side only, never exposed to the browser):
 *   N8N_API_URL           base URL of the n8n instance (e.g. http://localhost:5678)
 *   N8N_API_KEY           optional bearer token for the webhook(s)
 *   N8N_SIGNING_SECRET    optional HMAC secret to sign payloads (X-TaskFlow-Signature)
 *   INTEGRATIONS_ENCRYPTION_KEY  optional — reserved for future payload encryption
 */

export function isN8nConfigured(): boolean {
  return Boolean(env.N8N_API_URL);
}

export type N8nEvent =
  | 'agentic.decision'
  | 'order.transition'
  | 'inventory.adjust'
  | 'sc.order.analysed';

interface N8nWebhookOptions {
  /** Relative path of the webhook on the n8n instance, e.g. '/webhook/taskflow'. */
  path: string;
  event: N8nEvent;
  payload: Record<string, unknown>;
  /** Optional idempotency / correlation key echoed back by n8n. */
  eventId?: string;
}

function signPayload(secret: string, body: string, timestamp: number): string {
  // HMAC-SHA256 signature, hex-encoded, mirroring common webhook conventions.
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/**
 * Deliver an event to an n8n webhook. Includes exponential backoff with
 * jitter (up to 3 retries). Always resolves to a boolean (true = delivered,
 * false = skipped/error) and never throws — callers can ignore the result.
 */
export async function dispatchToN8n(
  opts: N8nWebhookOptions & { retryCount?: number }
): Promise<boolean> {
  if (!isN8nConfigured()) {
    logger.debug({ event: opts.event }, 'n8n not configured — skipping dispatch');
    return false;
  }

  const base = env.N8N_API_URL!.replace(/\/$/, '');
  const url = `${base}${opts.path.startsWith('/') ? '' : '/'}${opts.path}`;
  const timestamp = Date.now();
  const body = JSON.stringify({
    event: opts.event,
    eventId: opts.eventId ?? `${opts.event}-${timestamp}`,
    timestamp,
    data: opts.payload,
  });

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (env.N8N_API_KEY)
    headers.authorization = `Bearer ${env.N8N_API_KEY}`;
  if (env.N8N_SIGNING_SECRET) {
    headers['X-TaskFlow-Signature'] =
      signPayload(env.N8N_SIGNING_SECRET, body, timestamp);
  }

  const retryCount = opts.retryCount ?? 3;
  let lastErr: string | null = null;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        logger.warn(
          { event: opts.event, status: res.status, url, attempt },
          'n8n webhook returned non-2xx'
        );
        lastErr = `HTTP ${res.status}`;
        if (attempt < retryCount) {
          const baseMs = 1000 * Math.pow(2, attempt);
          const jitterMs = Math.random() * 500;
          await sleep(baseMs + jitterMs);
        }
        continue;
      }
      logger.info({ event: opts.event, url, attempt }, 'n8n webhook delivered');
      return true;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      logger.warn(
        { event: opts.event, error: lastErr, attempt, url },
        'n8n webhook delivery failed'
      );
      if (attempt < retryCount) {
        const delayMs = 1000 * Math.pow(2, attempt) + Math.random() * 500;
        await sleep(delayMs);
      }
    }
  }

  logger.error(
    { event: opts.event, error: lastErr, url, retryCount },
    'n8n webhook delivery exhausted — all retries failed'
  );
  return false;
}

/** Tiny sleep helper — fire-and-forget backoff, never throws. */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
