import { Prisma, HealthData, HealthDataType } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { prisma } from '../config/database';
import { subDays, startOfDay, endOfDay } from 'date-fns';

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

  createBulk(records: Prisma.HealthDataCreateManyInput[]): Promise<{ count: number }>;
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

  async createBulk(records: Prisma.HealthDataCreateManyInput[]): Promise<{ count: number }> {
    const result = await this.model.createMany({
      data: records,
      skipDuplicates: true,
    });
    return { count: result.count };
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
    const end = endOfDay(date);

    const results = await Promise.all(
      types.map(async (type) => {
        const aggregate = await this.model.aggregate({
          where: { userId, type, startDate: { gte: start, lte: end } },
          _sum: { value: true },
          _avg: { value: true },
          _max: { value: true },
          _min: { value: true },
        });
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
    return this.model.aggregate({
      where: { userId, type, startDate: { gte: startDate, lte: endDate } },
      _sum: { value: true },
      _avg: { value: true },
      _min: { value: true },
      _max: { value: true },
    });
  }

  async sumStepsForUsersBetween(userIds: string[], startDate: Date, endDate: Date): Promise<number> {
    if (userIds.length === 0) return 0;
    const result = await this.model.aggregate({
      where: {
        userId: { in: userIds },
        type: 'STEPS',
        startDate: { gte: startDate },
        endDate: { lte: endDate },
      },
      _sum: { value: true },
    });
    return result._sum.value ?? 0;
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