import { z } from 'zod';
import { successResponseSchema } from './common';
import { goalProgressSchema } from './goals.dto';
import { sharingScopeEnum } from './user.dto';

const fitnessSummarySchema = z.object({
  date: z.string(),
  steps: z.number(),
  activeEnergy: z.number(),
  distance: z.number(),
});

const partnerSummarySchema = z.object({
  date: z.string(),
  sharingScope: sharingScopeEnum,
  steps: z.number().optional(),
  activeEnergy: z.number().optional(),
  distance: z.number().optional(),
});

export const dashboardResponseSchema = successResponseSchema(z.object({
  summary: fitnessSummarySchema,
  partner: z.object({
    id: z.string(),
    name: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    sharingScope: sharingScopeEnum,
    summary: partnerSummarySchema,
  }).nullable(),
  goals: z.array(goalProgressSchema),
  sync: z.object({
    lastSyncedAt: z.date().nullable(),
    status: z.string().nullable(),
  }),
}));
