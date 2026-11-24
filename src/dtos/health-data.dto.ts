import { z } from 'zod';
import { successResponseSchema } from './common';
import { healthDataTypeEnum, healthDataUnitEnum } from './user.dto';

// ============================================
// HEALTH DATA DTOs - .NET: HealthDataController DTOs
// ============================================

// Enums
export const aggregateEnum = z.enum(['raw', 'hourly', 'daily', 'weekly']);

// Requests
export const createHealthDataRequestSchema = z.object({
  type: healthDataTypeEnum,
  unit: healthDataUnitEnum,
  value: z.number(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  sourceName: z.string().optional(),
  sourceVersion: z.string().optional(),
  deviceId: z.string().optional(),
  sourceSampleId: z.string().min(1).max(255).optional(),
  metadata: z.record(z.any()).optional(),
});

export const bulkHealthDataRequestSchema = z.object({
  data: z.array(createHealthDataRequestSchema).min(1).max(1000),
});

export const queryHealthDataSchema = z.object({
  type: healthDataTypeEnum.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
  aggregate: aggregateEnum.optional(),
});

export const partnerHealthDataQuerySchema = z.object({
  partnerId: z.string(),
  type: healthDataTypeEnum.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(500).default(50),
  aggregate: aggregateEnum.optional(),
});

// Responses
export const healthDataResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: healthDataTypeEnum,
  unit: healthDataUnitEnum,
  value: z.number(),
  startDate: z.date(),
  endDate: z.date(),
  sourceName: z.string().nullable(),
  sourceVersion: z.string().nullable(),
  deviceId: z.string().nullable(),
  sourceSampleId: z.string().nullable(),
  metadata: z.any().nullable(),
  syncedAt: z.date(),
  createdAt: z.date(),
});

export const aggregatedHealthDataSchema = z.object({
  bucket: z.string(),
}).passthrough(); // Dynamic properties per type

export const healthDataListResponseSchema = successResponseSchema(z.object({
  data: z.array(healthDataResponseSchema).or(z.array(aggregatedHealthDataSchema)),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number().optional(),
    hasMore: z.boolean(),
  }),
}));

export const bulkSyncResponseSchema = successResponseSchema(z.object({ synced: z.number() }));
export const createHealthDataResponseSchema = successResponseSchema(
  z.object({ healthData: healthDataResponseSchema })
);
export const partnerHealthDataResponseSchema = successResponseSchema(z.object({
  data: z.array(healthDataResponseSchema).or(z.array(aggregatedHealthDataSchema)),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    hasMore: z.boolean(),
  }),
  partner: z.object({
    id: z.string(),
    sharingScope: z.string(),
  }),
}));

export const dailySummarySchema = z.object({
  date: z.string(),
  steps: z.number(),
  activeEnergy: z.number(),
  exerciseMinutes: z.number(),
  currentHeartRate: z.number().nullable(),
  workouts: z.number(),
});

export const summaryResponseSchema = successResponseSchema(z.object({ summary: dailySummarySchema }));

export const partnerSummaryMetricSchema = z.object({
  type: healthDataTypeEnum,
  _sum: z.object({ value: z.number().nullable() }),
  _avg: z.object({ value: z.number().nullable() }),
  _max: z.object({ value: z.number().nullable() }),
  _min: z.object({ value: z.number().nullable() }),
});

export const partnerSummaryResponseSchema = successResponseSchema(z.object({
  summary: z.object({
    date: z.string(),
    metrics: z.array(partnerSummaryMetricSchema),
    sharingScope: z.string(),
  }),
}));

export const deleteHealthDataResponseSchema = successResponseSchema(z.object({ message: z.string() }));

// Types
export type CreateHealthDataRequest = z.infer<typeof createHealthDataRequestSchema>;
export type BulkHealthDataRequest = z.infer<typeof bulkHealthDataRequestSchema>;
export type QueryHealthData = z.infer<typeof queryHealthDataSchema>;
export type PartnerHealthDataQuery = z.infer<typeof partnerHealthDataQuerySchema>;

export type HealthDataResponse = z.infer<typeof healthDataResponseSchema>;
export type DailySummary = z.infer<typeof dailySummarySchema>;