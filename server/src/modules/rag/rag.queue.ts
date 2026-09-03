/**
 * Tier2 RAG queue — BullMQ + Redis
 * Real-time incremental indexing when scale >10k tasks/day.
 * Falls back to direct inline execution when Redis not configured (Tier1).
 */
import { Queue, Worker, QueueEvents, JobsOptions } from 'bullmq';
import { getRedis, isRedisEnabled } from '../../lib/redis';
import { logger } from '../../lib/logger';

export type RagJobName = 'upsert-task' | 'delete-task' | 'reindex-project' | 'reindex-all';

export interface RagJobData {
  taskId?: string;
  projectId?: string;
}

const QUEUE_NAME = 'rag-index';

let queue: Queue<RagJobData> | null = null;
let worker: Worker<RagJobData> | null = null;
let queueEvents: QueueEvents | null = null;

function getQueue(): Queue<RagJobData> | null {
  if (!isRedisEnabled()) return null;
  if (queue) return queue;
  const connection = getRedis();
  if (!connection) return null;
  queue = new Queue<RagJobData>(QUEUE_NAME, { connection });
  queueEvents = new QueueEvents(QUEUE_NAME, { connection: connection.duplicate() });
  queueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.warn({ area: 'rag-queue', jobId, failedReason }, 'RAG job failed');
  });
  return queue;
}

const DEFAULT_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 50,
};

export async function enqueueTaskUpsert(taskId: string, projectId?: string): Promise<void> {
  const q = getQueue();
  if (!q) {
    // Tier1 fallback — inline
    const { upsertTaskChunk } = await import('./rag.service');
    void upsertTaskChunk(taskId).catch(() => {});
    return;
  }
  await q.add('upsert-task', { taskId, projectId }, {
    ...DEFAULT_OPTS,
    jobId: `upsert-${taskId}`,
    // Deduplicate rapid updates: debounce 5s
    delay: 2000,
  });
}

export async function enqueueTaskDelete(taskId: string): Promise<void> {
  const q = getQueue();
  if (!q) {
    const { deleteTaskChunk } = await import('./rag.service');
    void deleteTaskChunk(taskId).catch(() => {});
    return;
  }
  await q.add('delete-task', { taskId }, {
    ...DEFAULT_OPTS,
    jobId: `delete-${taskId}`,
  });
}

export async function enqueueProjectReindex(projectId: string): Promise<void> {
  const q = getQueue();
  if (!q) {
    const { indexProject } = await import('./rag.service');
    void indexProject(projectId).catch(() => {});
    return;
  }
  await q.add('reindex-project', { projectId }, {
    ...DEFAULT_OPTS,
    jobId: `reindex-${projectId}`,
  });
}

export async function enqueueReindexAll(): Promise<void> {
  const q = getQueue();
  if (!q) return;
  await q.add('reindex-all', {}, {
    ...DEFAULT_OPTS,
    jobId: `reindex-all-${Date.now()}`,
  });
}

export function startRagWorker(): void {
  if (!isRedisEnabled()) {
    logger.info({ area: 'rag-queue' }, 'Redis not configured — RAG worker disabled (Tier1 inline mode)');
    return;
  }
  if (worker) return;
  const connection = getRedis();
  if (!connection) return;

  worker = new Worker<RagJobData>(QUEUE_NAME, async (job) => {
    const { taskId, projectId } = job.data;
    switch (job.name as RagJobName) {
      case 'upsert-task': {
        if (!taskId) throw new Error('Missing taskId');
        const { upsertTaskChunk } = await import('./rag.service');
        await upsertTaskChunk(taskId);
        logger.info({ area: 'rag-queue', jobId: job.id, taskId }, 'upsert-task done');
        break;
      }
      case 'delete-task': {
        if (!taskId) throw new Error('Missing taskId');
        const { deleteTaskChunk } = await import('./rag.service');
        await deleteTaskChunk(taskId);
        logger.info({ area: 'rag-queue', jobId: job.id, taskId }, 'delete-task done');
        break;
      }
      case 'reindex-project': {
        if (!projectId) throw new Error('Missing projectId');
        const { indexProject } = await import('./rag.service');
        const n = await indexProject(projectId);
        logger.info({ area: 'rag-queue', jobId: job.id, projectId, indexed: n }, 'reindex-project done');
        break;
      }
      case 'reindex-all': {
        const { prisma } = await import('../../lib/prisma');
        const { indexProject } = await import('./rag.service');
        const projects = await prisma.project.findMany({ select: { id: true } });
        let total = 0;
        for (const p of projects) {
          try {
            total += await indexProject(p.id);
          } catch (err) {
            logger.warn({ area: 'rag-queue', projectId: p.id, err: String(err) }, 'reindex-all partial fail');
          }
        }
        logger.info({ area: 'rag-queue', projects: projects.length, total }, 'reindex-all done');
        break;
      }
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }, {
    connection,
    concurrency: 2,
    limiter: { max: 10, duration: 1000 },
  });

  worker.on('failed', (job, err) => {
    logger.warn({ area: 'rag-queue', jobId: job?.id, err: String(err) }, 'RAG worker job failed');
  });

  // Daily repeatable for reindex-all at 02:00 when Redis is available
  void getQueue()?.add('reindex-all', {}, {
    ...DEFAULT_OPTS,
    repeat: { pattern: '0 2 * * *' },
    jobId: 'reindex-all-cron',
  }).catch(() => {});

  logger.info({ area: 'rag-queue' }, 'RAG worker started');
}

export async function stopRagQueue(): Promise<void> {
  if (queueEvents) {
    await queueEvents.close().catch(() => {});
    queueEvents = null;
  }
  if (worker) {
    await worker.close().catch(() => {});
    worker = null;
  }
  if (queue) {
    await queue.close().catch(() => {});
    queue = null;
  }
}

export function isQueueEnabled(): boolean {
  return isRedisEnabled();
}
