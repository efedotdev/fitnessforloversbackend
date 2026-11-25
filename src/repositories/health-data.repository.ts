import { Prisma, PrismaClient, HealthData, HealthDataType } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { prisma } from '../config/database';
import { subDays, startOfDay, addDays } from 'date-fns';

type HealthDataBulkResult = {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
};

const dailyAggregateTypes: Record<string, HealthDataType> = {
  steps: 'STEPS',
  'active-energy': 'ACTIVE_ENERGY',
  distance: 'DISTANCE_WALKING_RUNNING',
};

const earliestDailyAggregateTimestamp = Date.UTC(2000, 0, 1) / 1000;
const latestDailyAggregateTimestamp = Date.UTC(2100, 0, 1) / 1000;

function getDailyAggregateDate(record: {
  type: HealthDataType;
  sourceSampleId?: string | null;
}): string | null {
  const match = record.sourceSampleId?.match(
    /^healthkit-daily-(steps|active-energy|distance)-(?:(\d{4}-\d{2}-\d{2})|(\d+))$/
  );
  if (!match?.[1] || dailyAggregateTypes[match[1]] !== record.type) return null;

  const date = match[2];
  if (date) {
    const parsedDate = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return null;
    return date;
  }

  const timestamp = Number(match[3]);
  if (
    !Number.isSafeInteger(timestamp)
    || timestamp < earliestDailyAggregateTimestamp
    || timestamp >= latestDailyAggregateTimestamp
  ) return null;

  const parsedDate = new Date(timestamp * 1000);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return parsedDate.toISOString().slice(0, 10);
}

export function isDailyHealthKitAggregate(record: {
  type: HealthDataType;
  sourceSampleId?: string | null;
}): boolean {
  return getDailyAggregateDate(record) !== null;
}

function getAggregationValues(records: Array<{
  type: HealthDataType;
  value: number;
  startDate: Date;
  endDate: Date;
  sourceSampleId: string | null;
}>): number[] {
  const aggregates = records.flatMap((record) => {
    const date = getDailyAggregateDate(record);
    return date ? [{ date, startDate: record.startDate, endDate: record.endDate }] : [];
  });

  return records
    .filter((record) => {
      if (getDailyAggregateDate(record)) return true;
      const date = record.startDate.toISOString().slice(0, 10);
      return !aggregates.some((aggregate) =>
        aggregate.date === date
        || (record.startDate >= aggregate.startDate && record.startDate < aggregate.endDate)
      );
    })
    .map((record) => record.value);
}

// ============================================
// HEALTH DATA REPOSITORY - .NET: IHealthDataRepository
// ============================================
// Handles health data (HealthKit sync) database operations

export interface IHealthDataRepository extends BaseRepository<
  HealthData,
  Prisma.HealthDataCreateInput,
  Prisma.HealthDataUpdateInput,
  Prisma.HealthDataWhereInput
> {
  findByUserAndDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    type?: HealthDataType,
    limit?: number,
    offset?: number
  ): Promise<{ data: HealthData[]; total: number }>;

  findPartnerData(
    partnerId: string,
    allowedTypes: HealthDataType[],
    startDate: Date,
    endDate: Date,
    type?: HealthDataType,
    limit?: number
  ): Promise<{ data: HealthData[]; total: number }>;

  createBulk(
    records: Prisma.HealthDataCreateManyInput[],
    tx?: Pick<Prisma.TransactionClient, 'healthData'>
  ): Promise<HealthDataBulkResult>;
  deleteByUserAndId(userId: string, id: string): Promise<HealthData | null>;

  // Aggregation queries for dashboard summaries
  getDailySummaries(userId: string, date: Date, types: HealthDataType[]): Promise<Record<HealthDataType, any>>;
  getAggregateStats(
    userId: string,
    type: HealthDataType,
    startDate: Date,
    endDate: Date
  ): Promise<{ _sum: { value: number | null }; _avg: { value: number | null }; _min: { value: number | null }; _max: { value: number | null } }>;
  sumStepsForUsersBetween(userIds: string[], startDate: Date, endDate: Date): Promise<number>;
  getLatestSync(userId: string): Promise<{ completedAt: Date | null; status: string } | null>;
  createFailedSyncLog(userId: string, startedAt: Date, errorMessage: string): Promise<void>;
}

export class HealthDataRepository extends BaseRepository<
  HealthData,
  Prisma.HealthDataCreateInput,
  Prisma.HealthDataUpdateInput,
  Prisma.HealthDataWhereInput
> implements IHealthDataRepository {

  protected model = prisma.healthData;

  async findByUserAndDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    type?: HealthDataType,
    limit = 100,
    offset = 0
  ): Promise<{ data: HealthData[]; total: number }> {
    const where: Prisma.HealthDataWhereInput = {
      userId,
      startDate: { gte: startDate },
      endDate: { lte: endDate },
    };
    if (type) where.type = type;

    const [data, total] = await Promise.all([
      this.model.findMany({
        where,
        orderBy: { startDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.model.count({ where }),
    ]);

    return { data, total };
  }

  async findPartnerData(
    partnerId: string,
    allowedTypes: HealthDataType[],
    startDate: Date,
    endDate: Date,
    type?: HealthDataType,
    limit = 50
  ): Promise<{ data: HealthData[]; total: number }> {
    const where: Prisma.HealthDataWhereInput = {
      userId: partnerId,
      startDate: { gte: startDate },
      endDate: { lte: endDate },
      type: { in: allowedTypes },
    };
    if (type) where.type = type;

    const [data, total] = await Promise.all([
      this.model.findMany({
        where,
        orderBy: { startDate: 'desc' },
        take: limit,
      }),
      this.model.count({ where }),
    ]);

    return { data, total };
  }

  async createBulk(
    records: Prisma.HealthDataCreateManyInput[],
    tx: Pick<Prisma.TransactionClient, 'healthData'> | PrismaClient = prisma
  ): Promise<HealthDataBulkResult> {
    const dailyAggregates = records.filter(isDailyHealthKitAggregate);
    const samples = records.filter((record) => !dailyAggregates.includes(record));
    const inserted = await tx.healthData.createMany({
      data: samples,
      skipDuplicates: true,
    });

    let createdCount = inserted.count;
    let updatedCount = 0;
    for (const record of dailyAggregates) {
      const sourceSampleId = record.sourceSampleId;
      if (!sourceSampleId) continue;

      const where = {
        userId_sourceSampleId: {
          userId: record.userId,
          sourceSampleId,
        },
      };
      const existing = await tx.healthData.findUnique({ where, select: { id: true } });
      if (existing) {
        await tx.healthData.update({
          where,
          data: {
            type: record.type,
            unit: record.unit,
            value: record.value,
            startDate: record.startDate,
            endDate: record.endDate,
            sourceName: record.sourceName,
            sourceVersion: record.sourceVersion,
            deviceId: record.deviceId,
            metadata: record.metadata,
            syncedAt: new Date(),
          },
        });
        updatedCount += 1;
      } else {
        await tx.healthData.create({ data: record });
        createdCount += 1;
      }
    }

    return {
      createdCount,
      updatedCount,
      skippedCount: samples.length - inserted.count,
    };
  }

  async deleteByUserAndId(userId: string, id: string): Promise<HealthData | null> {
    const existing = await this.model.findFirst({ where: { id, userId } });
    if (!existing) return null;
    return this.model.delete({ where: { id } });
  }

  async getDailySummaries(
    userId: string,
    date: Date,
    types: HealthDataType[]
  ): Promise<Record<string, any>> {
    const start = startOfDay(date);
    const end = startOfDay(addDays(date, 1));

    const results = await Promise.all(
      types.map(async (type) => {
        const aggregate = await this.getAggregateStats(userId, type, start, end);
        return { type, ...aggregate };
      })
    );

    return Object.fromEntries(results.map(r => [r.type, r]));
  }

  async getAggregateStats(
    userId: string,
    type: HealthDataType,
    startDate: Date,
    endDate: Date
  ) {
    const records = await this.getRecordsForAggregation({
      userId,
      type,
      startDate: { gte: startDate, lt: endDate },
    });
    const values = getAggregationValues(records);
    const sum = values.reduce((total, value) => total + value, 0);
    return {
      _sum: { value: values.length ? sum : null },
      _avg: { value: values.length ? sum / values.length : null },
      _min: { value: values.length ? Math.min(...values) : null },
      _max: { value: values.length ? Math.max(...values) : null },
    };
  }

  async sumStepsForUsersBetween(userIds: string[], startDate: Date, endDate: Date): Promise<number> {
    if (userIds.length === 0) return 0;
    const values = await Promise.all(userIds.map(async (userId) => {
      const records = await this.getRecordsForAggregation({
        userId,
        type: 'STEPS',
        startDate: { gte: startDate },
        endDate: { lte: endDate },
      });
      return getAggregationValues(records).reduce((sum, value) => sum + value, 0);
    }));
    return values.reduce((sum, value) => sum + value, 0);
  }

  private getRecordsForAggregation(where: Prisma.HealthDataWhereInput) {
    return this.model.findMany({
      where,
      select: { type: true, value: true, startDate: true, endDate: true, sourceSampleId: true },
    });
  }

  async getLatestSync(userId: string): Promise<{ completedAt: Date | null; status: string } | null> {
    return prisma.syncLog.findFirst({
      where: { userId },
      select: { completedAt: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createFailedSyncLog(userId: string, startedAt: Date, errorMessage: string): Promise<void> {
    await prisma.syncLog.create({
      data: {
        userId,
        recordsCount: 0,
        status: 'FAILED',
        errorMessage,
        startedAt,
        completedAt: new Date(),
      },
    });
  }
}

export const healthDataRepository = new HealthDataRepository();