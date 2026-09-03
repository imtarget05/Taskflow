import { z } from 'zod';

export const indexProjectParamsSchema = z.object({
  projectId: z.string().cuid(),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'q is required').max(500),
  projectId: z.string().cuid().optional(),
  topK: z.coerce.number().int().min(1).max(20).optional(),
});
