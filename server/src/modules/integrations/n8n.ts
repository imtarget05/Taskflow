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
 * Deliver an event to an n8n webhook. Always resolves to a boolean (true =
 * delivered, false = skipped/error) and never throws — callers can ignore the
 * result. Network issues, non-2xx, or missing configuration all return false.
 */
export async function dispatchToN8n(opts: N8nWebhookOptions): Promise<boolean> {
  if (!isN8nConfigured()) {
    logger.debug({ event: opts.event }, 'n8n not configured — skipping dispatch');
    return false;
  }

  const base = env.N8N_API_URL!.replace(/\/+$/, '');
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
  if (env.N8N_API_KEY) headers.authorization = `Bearer ${env.N8N_API_KEY}`;
  if (env.N8N_SIGNING_SECRET) {
    headers['X-TaskFlow-Signature'] = signPayload(env.N8N_SIGNING_SECRET, body, timestamp);
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn(
        { event: opts.event, status: res.status, url },
        'n8n webhook returned non-2xx'
      );
      return false;
    }
    logger.info({ event: opts.event, url }, 'n8n webhook delivered');
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ event: opts.event, error: msg }, 'n8n webhook delivery failed');
    return false;
  }
}
