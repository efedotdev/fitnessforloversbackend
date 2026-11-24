import { z } from 'zod';
import { successResponseSchema } from './common';

const dateTimeSchema = z.string().datetime();

export const createGoalRequestSchema = z.object({
  pairingId: z.string().cuid(),
  title: z.string().trim().min(1).max(100),
  targetValue: z.number().positive(),
  startDate: dateTimeSchema,
  endDate: dateTimeSchema,
}).strict();

export const updateGoalRequestSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  targetValue: z.number().positive().optional(),
  startDate: dateTimeSchema.optional(),
  endDate: dateTimeSchema.optional(),
}).strict();

export const goalProgressSchema = z.object({
  id: z.string(),
  pairingId: z.string(),
  createdById: z.string(),
  title: z.string(),
  targetValue: z.number(),
  startDate: z.date(),
  endDate: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
  currentValue: z.number(),
  remainingValue: z.number(),
  progressPercentage: z.number(),
  completed: z.boolean(),
});

export const goalResponseSchema = successResponseSchema(z.object({ goal: goalProgressSchema }));
export const goalListResponseSchema = successResponseSchema(z.object({ goals: z.array(goalProgressSchema) }));
export const goalProgressResponseSchema = successResponseSchema(z.object({
  progress: z.object({
    currentValue: z.number(),
    remainingValue: z.number(),
    progressPercentage: z.number(),
    completed: z.boolean(),
  }),
}));

export type CreateGoalRequest = z.infer<typeof createGoalRequestSchema>;
export type UpdateGoalRequest = z.infer<typeof updateGoalRequestSchema>;
