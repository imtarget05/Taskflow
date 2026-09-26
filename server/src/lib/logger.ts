import pino from 'pino';
import { env } from '../config/env';

/**
 * Centralized structured logger for the server.
 *
 * Why a single instance:
 *  - Every log line carries the same shape (level, time, msg, ...fields),
 *    which makes them trivially grep-able / ingestible by any log backend.
 *  - Replaces ad-hoc `console.error`/`console.log` calls so that error output
 *    is structured and consistent. Secret redaction for HTTP logs is explicit
 *    below (HTTP_LOG_REDACT_PATHS) — never by convention alone.
 *
 * Why the redaction list matters: pino-http (wired in app.ts) serialises
 * `req.headers` and `res.headers` verbatim, and the response `set-cookie`
 * header carries the auth cookies, so an unredacted `set-cookie` writes live
 * access/refresh JWTs into every "request completed" log line.
 * Level is driven by NODE_ENV so production stays quiet (warn+error only)
 * while dev/test surface debug lines.
 */

/** Censor text pino writes in place of a redacted value (fast-redact default). */
export const LOG_CENSOR = '[Redacted]';

/**
 * Redaction paths for HTTP request/response logging (consumed by pino-http in
 * app.ts). Covers both directions: credentials the client sends (`authorization`,
 * `cookie`, `x-csrf-token`) and credentials the server returns (`set-cookie`,
 * which carries `access_token`, `refresh_token` and `csrf_token`).
 *
 * `x-csrf-token` and `set-cookie` need bracket notation because of the dash.
 */
export const HTTP_LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
];

const level = env.NODE_ENV === 'production' ? 'warn' : env.NODE_ENV === 'test' ? 'silent' : 'debug';

export const logger = pino({
  level,
  base: { service: 'taskflow-server', env: env.NODE_ENV },
  // Human-readable in dev, JSON in prod (pino auto-detects TTY but be explicit).
  transport:
    env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
});

export default logger;
