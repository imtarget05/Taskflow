import pino from 'pino';
import { env } from '../config/env';

/**
 * Centralized structured logger for the server.
 *
 * Why a single instance:
 *  - Every log line carries the same shape (level, time, msg, ...fields),
 *    which makes them trivially grep-able / ingestible by any log backend.
 *  - Replaces ad-hoc `console.error`/`console.log` calls so that error output
 *    is structured and never leaks secrets (pino redacts nothing here because
 *    we already avoid logging secrets — but it is consistent).
 *  - Level is driven by NODE_ENV so production stays quiet (warn+error only)
 *    while dev/test surface debug lines.
 */
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
