import { z } from 'zod';

export const createExperimentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  config: z.record(z.unknown()),
  datasetSize: z.number().int().min(0).optional(),
  status: z.enum(['running', 'completed', 'failed']).optional(),
});

export const recordMetricsSchema = z.object({
  faithfulness: z.number().min(0).max(1).optional(),
  answerRelevancy: z.number().min(0).max(1).optional(),
  contextRecall: z.number().min(0).max(1).optional(),
  contextPrecision: z.number().min(0).max(1).optional(),
  avgLatency: z.number().int().min(0).optional(),
});

export const compareSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(20),
});

export const listExperimentsSchema = z.object({
  status: z.enum(['running', 'completed', 'failed']).optional(),
  name: z.string().optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const bestConfigSchema = z.object({
  metric: z.string().min(1),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});
