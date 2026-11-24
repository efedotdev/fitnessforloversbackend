import { healthDataRepository, pairingRepository, userPreferencesRepository } from '../repositories';
import {
  CreateHealthDataRequest,
  BulkHealthDataRequest,
  QueryHealthData,
  PartnerHealthDataQuery,
  HealthDataResponse,
  DailySummary,
} from '../dtos';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  SharingScopeError,
} from '../exceptions';
import { pairingService, PairingService } from './pairing.service';
import { logger } from '../config/logger';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';
import { HealthDataType, SharingScope } from '@prisma/client';

// ============================================
// HEALTH DATA SERVICE - .NET: IHealthDataService / HealthDataService
// ============================================
// Business logic for health data: CRUD, bulk sync, partner sharing, aggregations

export interface IHealthDataService {
  create(userId: string, data: CreateHealthDataRequest): Promise<HealthDataResponse>;
  bulkCreate(userId: string, data: BulkHealthDataRequest): Promise<{ synced: number }>;
  getMyData(userId: string, query: QueryHealthData): Promise<{ data: Array<HealthDataResponse | Record<string, unknown>>; pagination: any }>;
  getDailySummary(userId: string): Promise<DailySummary>;
  getPartnerData(userId: string, query: PartnerHealthDataQuery): Promise<{ data: Array<HealthDataResponse | Record<string, unknown>>; pagination: any; partner: any }>;
  getPartnerSummary(userId: string, partnerId: string): Promise<any>;
  delete(userId: string, healthDataId: string): Promise<{ message: string }>;
}

export class HealthDataService implements IHealthDataService {
  // Create Single Health Data - .NET: async Task<HealthDataResponse> CreateAsync(string userId, CreateHealthDataRequest data)
  async create(userId: string, data: CreateHealthDataRequest): Promise<HealthDataResponse> {
    const healthData = await healthDataRepository.create({
      user: { connect: { id: userId } },
      ...data,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
    });

    logger.debug({ userId, type: data.type }, 'Health data created');

    return this.toResponse(healthData);
  }

  // Bulk Create (HealthKit Sync) - .NET: async Task<BulkSyncResponse> BulkCreateAsync(string userId, BulkHealthDataRequest data)
  async bulkCreate(userId: string, data: BulkHealthDataRequest): Promise<{ synced: number }> {
    const startedAt = new Date();
    const records = data.data.map(d => ({
      userId,
      ...d,
      startDate: new Date(d.startDate),
      endDate: new Date(d.endDate),
    }));

    let result: { count: number };
    try {
      result = await healthDataRepository.transaction(async (tx: any) => {
        const created = await tx.healthData.createMany({
          data: records,
          skipDuplicates: true,
        });

        await tx.syncLog.create({
          data: {
            userId,
            recordsCount: created.count,
            status: 'SUCCESS',
            startedAt,
            completedAt: new Date(),
          },
        });

        return created;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown sync error';
      try {
        await healthDataRepository.createFailedSyncLog(userId, startedAt, message);
      } catch (logError) {
        logger.error({ userId, error: logError }, 'Failed to record health sync failure');
      }
      throw error;
    }

    logger.info({ userId, count: result.count }, 'Bulk health data sync completed');

    return { synced: result.count };
  }

  // Get My Health Data - .NET: async Task<PagedResponse<HealthDataResponse>> GetMyDataAsync(string userId, QueryHealthData query)
  async getMyData(userId: string, query: QueryHealthData): Promise<{ data: Array<HealthDataResponse | Record<string, unknown>>; pagination: any }> {
    const { type, startDate, endDate, limit, offset, aggregate } = query;

    const start = startDate ? new Date(startDate) : subDays(new Date(), 30);
    const end = endDate ? new Date(endDate) : new Date();

    const { data, total } = await healthDataRepository.findByUserAndDateRange(
      userId, start, end, type, limit, offset
    );

    let aggregated = data;
    if (aggregate && aggregate !== 'raw') {
      aggregated = await this.aggregateHealthData(data, aggregate);
    }

    return {
      data: aggregate && aggregate !== 'raw' ? aggregated : aggregated.map(this.toResponse),
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    };
  }

  // Get Daily Summary (Dashboard) - .NET: async Task<DailySummary> GetDailySummaryAsync(string userId)
  async getDailySummary(userId: string): Promise<DailySummary> {
    const today = new Date();
    const start = startOfDay(today);
    const end = endOfDay(today);

    const [steps, activeEnergy, exerciseMinutes, heartRate, workouts] = await Promise.all([
      healthDataRepository.getAggregateStats(userId, 'STEPS', start, end),
      healthDataRepository.getAggregateStats(userId, 'ACTIVE_ENERGY', start, end),
      healthDataRepository.getAggregateStats(userId, 'EXERCISE_MINUTES', start, end),
      healthDataRepository.findByUserAndDateRange(userId, start, end, 'HEART_RATE', 1, 0),
      healthDataRepository.findByUserAndDateRange(userId, start, end, 'WORKOUT', 100, 0),
    ]);

    return {
      date: format(today, 'yyyy-MM-dd'),
      steps: steps._sum.value ?? 0,
      activeEnergy: activeEnergy._sum.value ?? 0,
      exerciseMinutes: exerciseMinutes._sum.value ?? 0,
      currentHeartRate: heartRate.data[0]?.value ?? null,
      workouts: workouts.data.length,
    };
  }

  // Get Partner Health Data - .NET: async Task<PartnerDataResponse> GetPartnerDataAsync(string userId, PartnerHealthDataQuery query)
  async getPartnerData(userId: string, query: PartnerHealthDataQuery): Promise<{ data: Array<HealthDataResponse | Record<string, unknown>>; pagination: any; partner: any }> {
    const { partnerId, type, startDate, endDate, limit, aggregate } = query;

    // Verify pairing and access
    const pairing = await pairingRepository.findBetweenUsers(userId, partnerId);
    if (!pairing || pairing.status !== 'ACCEPTED') {
      throw new ForbiddenError('Not paired with this user');
    }

    const allowedTypes = PairingService.getAllowedTypes(pairing.sharingScope, pairing.customTypes);
    if (type && !allowedTypes.includes(type as HealthDataType)) {
      throw new SharingScopeError(type);
    }

    const start = startDate ? new Date(startDate) : subDays(new Date(), 30);
    const end = endDate ? new Date(endDate) : new Date();

    const { data, total } = await healthDataRepository.findPartnerData(
      partnerId, allowedTypes, start, end, type as HealthDataType, limit
    );

    let aggregated = data;
    if (aggregate && aggregate !== 'raw') {
      aggregated = await this.aggregateHealthData(data, aggregate);
    }

    return {
      data: aggregate && aggregate !== 'raw' ? aggregated : aggregated.map(this.toResponse),
      pagination: { total, limit, hasMore: false },
      partner: {
        id: partnerId,
        sharingScope: pairing.sharingScope,
      },
    };
  }

  // Get Partner Daily Summary - .NET: async Task<PartnerSummaryResponse> GetPartnerSummaryAsync(string userId, string partnerId)
  async getPartnerSummary(userId: string, partnerId: string): Promise<any> {
    const pairing = await pairingRepository.findBetweenUsers(userId, partnerId);
    if (!pairing || pairing.status !== 'ACCEPTED') {
      throw new ForbiddenError('Not paired with this user');
    }

    const allowedTypes = PairingService.getAllowedTypes(pairing.sharingScope, pairing.customTypes);
    const today = new Date();
    const start = startOfDay(today);
    const end = endOfDay(today);

    const metrics = await Promise.all(
      allowedTypes.map(async (type: HealthDataType) => {
        const result = await healthDataRepository.getAggregateStats(partnerId, type, start, end);
        return { type, ...result };
      })
    );

    return {
      summary: {
        date: format(today, 'yyyy-MM-dd'),
        metrics: metrics.filter((m: any) => m._sum.value != null),
        sharingScope: pairing.sharingScope,
      },
    };
  }

  // Delete Health Data - .NET: async Task<DeleteResponse> DeleteAsync(string userId, string healthDataId)
  async delete(userId: string, healthDataId: string): Promise<{ message: string }> {
    const deleted = await healthDataRepository.deleteByUserAndId(userId, healthDataId);

    if (!deleted) {
      throw new NotFoundError('Health data');
    }

    logger.info({ userId, healthDataId }, 'Health data deleted');

    return { message: 'Health data deleted' };
  }

  // Private helpers
  private toResponse(healthData: any): HealthDataResponse {
    return {
      id: healthData.id,
      userId: healthData.userId,
      type: healthData.type,
      unit: healthData.unit,
      value: healthData.value,
      startDate: healthData.startDate,
      endDate: healthData.endDate,
      sourceName: healthData.sourceName,
      sourceVersion: healthData.sourceVersion,
      deviceId: healthData.deviceId,
      sourceSampleId: healthData.sourceSampleId,
      metadata: healthData.metadata,
      syncedAt: healthData.syncedAt,
      createdAt: healthData.createdAt,
    };
  }

  private async aggregateHealthData(records: any[], granularity: string): Promise<any[]> {
    const grouped = new Map<string, any[]>();

    for (const record of records) {
      let key: string;
      const date = new Date(record.startDate);

      switch (granularity) {
        case 'hourly':
          key = format(date, 'yyyy-MM-dd HH:00');
          break;
        case 'daily':
          key = format(date, 'yyyy-MM-dd');
          break;
        case 'weekly':
          key = format(date, 'yyyy-"W"ww');
          break;
        default:
          key = record.startDate;
      }

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(record);
    }

    const aggregated = [];
    for (const [bucket, items] of grouped) {
      const byType = new Map<string, number[]>();
      for (const item of items) {
        if (!byType.has(item.type)) byType.set(item.type, []);
        byType.get(item.type)!.push(item.value);
      }

      const summary: any = { bucket };
      for (const [type, values] of byType) {
        summary[type] = {
          count: values.length,
          sum: values.reduce((a, b) => a + b, 0),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
        };
      }
      aggregated.push(summary);
    }

    return aggregated.sort((a, b) => b.bucket.localeCompare(a.bucket));
  }
}

export const healthDataService = new HealthDataService();