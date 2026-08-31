import { z } from 'zod';

export const updateWeightsSchema = z.object({
  skillMatch: z.number().min(0).max(1).optional(),
  availability: z.number().min(0).max(1).optional(),
  priority: z.number().min(0).max(1).optional(),
  history: z.number().min(0).max(1).optional(),
  workloadBalance: z.number().min(0).max(1).optional(),
});

export const refreshSchema = z.object({
  projectId: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const listSchema = z.object({
  status: z.enum(['pending', 'accepted', 'dismissed', 'expired']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const acceptSchema = z.object({
  assign: z.boolean().optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const skillSchema = z.object({
  skill: z.string().min(1).max(50),
  level: z.number().int().min(1).max(5),
});

export const updateSkillsSchema = z.object({
  skills: z.array(skillSchema).min(1).max(20),
});

export const availabilitySlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  morning: z.boolean().optional(),
  afternoon: z.boolean().optional(),
  evening: z.boolean().optional(),
});

export const updateAvailabilitySchema = z.array(availabilitySlotSchema).min(1).max(7);
