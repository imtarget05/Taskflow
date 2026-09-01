import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';

export interface CreateExperimentInput {
  name: string;
  description?: string;
  config: Record<string, unknown>;
  datasetSize?: number;
  status?: string;
  createdBy?: string;
}

export interface MetricsInput {
  faithfulness?: number;
  answerRelevancy?: number;
  contextRecall?: number;
  contextPrecision?: number;
  avgLatency?: number;
}

export interface ListFilters {
  status?: string;
  name?: string;
  page?: number;
  limit?: number;
}

/**
 * Create a new retrieval experiment with the given config.
 */
export async function createExperiment(data: CreateExperimentInput) {
  return prisma.retrievalExperiment.create({
    data: {
      name: data.name,
      description: data.description,
      config: data.config as object,
      datasetSize: data.datasetSize ?? 0,
      status: data.status ?? 'running',
      createdBy: data.createdBy,
    },
  });
}

/**
 * Record metrics for an experiment. Transitions status to 'completed'.
 * Throws 404 if not found, 400 if already completed/failed.
 */
export async function recordMetrics(experimentId: string, metrics: MetricsInput) {
  const existing = await prisma.retrievalExperiment.findUnique({
    where: { id: experimentId },
  });

  if (!existing) {
    throw new AppError('Experiment not found', StatusCodes.NOT_FOUND);
  }

  if (existing.status === 'completed' || existing.status === 'failed') {
    throw new AppError(
      `Cannot record metrics for ${existing.status} experiment`,
      StatusCodes.BAD_REQUEST
    );
  }

  return prisma.retrievalExperiment.update({
    where: { id: experimentId },
    data: {
      metrics: metrics as object,
      status: 'completed',
      completedAt: new Date(),
    },
  });
}

/**
 * Compare multiple experiments side-by-side by their IDs.
 */
export async function compareExperiments(ids: string[]) {
  const experiments = await Promise.all(
    ids.map(async (id) => {
      const exp = await prisma.retrievalExperiment.findUnique({
        where: { id },
      });
      if (!exp) {
        throw new AppError(`Experiment not found: ${id}`, StatusCodes.NOT_FOUND);
      }
      return exp;
    })
  );

  return experiments;
}

/**
 * Find the best config for a given metric. For latency-like metrics,
 * lower is better; for quality metrics, higher is better.
 */
export async function getBestConfig(metric: string) {
  const LOWER_IS_BETTER = new Set(['avgLatency', 'latency', 'cost']);

  const experiments = await prisma.retrievalExperiment.findMany({
    where: { status: 'completed' },
    orderBy: { createdAt: 'desc' },
  });

  const withMetric = experiments.filter(
    (e) => e.metrics && typeof (e.metrics as Record<string, unknown>)[metric] === 'number'
  );

  if (withMetric.length === 0) return null;

  const sorted = [...withMetric].sort((a, b) => {
    const aVal = (a.metrics as Record<string, number>)[metric];
    const bVal = (b.metrics as Record<string, number>)[metric];
    return LOWER_IS_BETTER.has(metric) ? aVal - bVal : bVal - aVal;
  });

  return sorted[0];
}

/**
 * List experiments with optional filtering and pagination.
 */
export async function listExperiments(filters: ListFilters) {
  const where: Record<string, unknown> = {};

  if (filters.status) where.status = filters.status;
  if (filters.name) where.name = { contains: filters.name, mode: 'insensitive' };

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.retrievalExperiment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.retrievalExperiment.count({ where }),
  ]);

  return { data, total, page, limit };
}

/**
 * Get a single experiment by ID.
 */
export async function getExperiment(id: string) {
  const experiment = await prisma.retrievalExperiment.findUnique({
    where: { id },
  });

  if (!experiment) {
    throw new AppError('Experiment not found', StatusCodes.NOT_FOUND);
  }

  return experiment;
}
