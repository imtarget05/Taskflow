import { z } from 'zod';

export const createPromptSchema = z.object({
  name: z.string().min(1).max(100),
  version: z.string().min(1).max(20),
  content: z.string().min(1),
  variables: z.array(z.string()).default([]),
  isActive: z.boolean().default(false),
  metrics: z.record(z.unknown()).optional(),
  createdBy: z.string().optional(),
});

export const activatePromptSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});

export const renderPromptSchema = z.object({
  name: z.string().min(1),
  variables: z.record(z.string()).default({}),
});

export const createExperimentSchema = z.object({
  name: z.string().min(1).max(200),
  promptName: z.string().min(1),
  variantA: z.string().min(1),
  variantB: z.string().min(1),
  trafficSplit: z.number().min(0).max(1).default(0.5),
});

export const recordResultSchema = z.object({
  variant: z.enum(['A', 'B']),
  metrics: z.object({
    accuracy: z.number().min(0).max(1).optional(),
    latency: z.number().min(0).optional(),
    count: z.number().int().min(0).optional(),
  }),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});
