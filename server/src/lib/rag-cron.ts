/**
 * Tier 1 RAG nightly re-index — in-process cron, 0 Redis.
 * Tier 2 (BullMQ+Redis) uses repeatable BullMQ job when REDIS_URL is set.
 */
import { prisma } from './prisma';
import { indexProject } from '../modules/rag/rag.service';
import { logger } from './logger';
import { isQueueEnabled } from '../modules/rag/rag.queue';

let timer: NodeJS.Timeout | null = null;

function msUntilNext02(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(2, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function runNightlyReindex(): Promise<void> {
  if (process.env.NODE_ENV === 'test') return;
  try {
    const projects = await prisma.project.findMany({ select: { id: true } });
    let total = 0;
    for (const p of projects) {
      try {
        const n = await indexProject(p.id);
        total += n;
      } catch (err) {
        logger.warn({ area: 'rag-cron', projectId: p.id, err: String(err) }, 'nightly reindex failed for project');
      }
    }
    logger.info({ area: 'rag-cron', projects: projects.length, total }, 'nightly RAG reindex done');
  } catch (err) {
    logger.warn({ area: 'rag-cron', err: String(err) }, 'nightly reindex run failed');
  }
}

function scheduleNext(): void {
  const delay = msUntilNext02();
  timer = setTimeout(async () => {
    await runNightlyReindex();
    scheduleNext();
  }, delay);
  // Don't block process exit in dev
  if (timer.unref) timer.unref();
}

export function startRagCron(): void {
  if (process.env.NODE_ENV === 'test') return;
  if (timer) return;
  if (isQueueEnabled()) {
    logger.info({ area: 'rag-cron' }, 'Redis enabled — nightly reindex handled by BullMQ repeatable (02:00), in-process cron disabled');
    return;
  }
  scheduleNext();
  logger.info('RAG nightly cron scheduled (02:00) — Tier1 fallback');
}

export function stopRagCron(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

export { runNightlyReindex };
