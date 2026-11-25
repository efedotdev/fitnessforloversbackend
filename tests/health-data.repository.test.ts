import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { HealthDataType } from '@prisma/client';

describe('HealthDataRepository bulk sync', () => {
  let HealthDataRepository: typeof import('../src/repositories/health-data.repository').HealthDataRepository;
  let isDailyHealthKitAggregate: typeof import('../src/repositories/health-data.repository').isDailyHealthKitAggregate;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/fitnessforlovers';
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-123456';
    process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-that-is-long-enough-123';
    ({ HealthDataRepository, isDailyHealthKitAggregate } = await import('../src/repositories/health-data.repository'));
  });

  it.each([
    ['healthkit-daily-steps-1795554000', 'STEPS'],
    ['healthkit-daily-active-energy-1795554000', 'ACTIVE_ENERGY'],
    ['healthkit-daily-distance-1795554000', 'DISTANCE_WALKING_RUNNING'],
    ['healthkit-daily-steps-2026-11-25', 'STEPS'],
  ])('recognizes daily aggregate ID %s', (sourceSampleId, type) => {
    expect(isDailyHealthKitAggregate({ sourceSampleId, type: type as HealthDataType })).toBe(true);
  });

  it.each([
    ['healthkit-daily-steps-invalid', 'STEPS'],
    ['healthkit-daily-steps--1', 'STEPS'],
    ['healthkit-daily-steps-99999999999', 'STEPS'],
    ['healthkit-daily-unknown-1795554000', 'STEPS'],
    ['healthkit-daily-steps-1795554000', 'ACTIVE_ENERGY'],
    ['normal-healthkit-uuid', 'STEPS'],
  ])('rejects non-aggregate ID %s', (sourceSampleId, type) => {
    expect(isDailyHealthKitAggregate({ sourceSampleId, type: type as HealthDataType })).toBe(false);
  });

  it('upserts daily aggregates per user and skips duplicate raw samples', async () => {
    const stored = new Map<string, Record<string, any>>();
    const keyOf = (record: { userId: string; sourceSampleId: string | null }) =>
      `${record.userId}:${record.sourceSampleId}`;
    const tx = {
      healthData: {
        createMany: vi.fn(async ({ data }: { data: Array<Record<string, any>> }) => {
          let count = 0;
          for (const record of data) {
            const key = keyOf(record);
            if (stored.has(key)) continue;
            stored.set(key, record);
            count += 1;
          }
          return { count };
        }),
        findUnique: vi.fn(async ({ where }: { where: { userId_sourceSampleId: { userId: string; sourceSampleId: string } } }) => {
          const { userId, sourceSampleId } = where.userId_sourceSampleId;
          const record = stored.get(`${userId}:${sourceSampleId}`);
          return record ? { id: 'existing-id' } : null;
        }),
        update: vi.fn(async ({ where, data }: {
          where: { userId_sourceSampleId: { userId: string; sourceSampleId: string } };
          data: Record<string, any>;
        }) => {
          const { userId, sourceSampleId } = where.userId_sourceSampleId;
          const key = `${userId}:${sourceSampleId}`;
          const record = { ...stored.get(key), ...data };
          stored.set(key, record);
          return record;
        }),
        create: vi.fn(async ({ data }: { data: Record<string, any> }) => {
          stored.set(keyOf(data), data);
          return data;
        }),
      },
    };

    const daily = (userId: string, type: string, sourceSampleId: string, value: number) => ({
      userId,
      type,
      unit: type === 'STEPS' ? 'COUNT' : type === 'ACTIVE_ENERGY' ? 'KCAL' : 'KM',
      sourceSampleId,
      sourceName: 'HealthKit daily aggregate',
      value,
      startDate: new Date('2026-11-25T00:00:00.000Z'),
      endDate: new Date('2026-11-26T00:00:00.000Z'),
    });
    const raw = (sourceSampleId: string, value: number) => ({
      ...daily('user-a', 'STEPS', sourceSampleId, value),
      sourceName: 'HealthKit',
      startDate: new Date('2026-11-25T08:00:00.000Z'),
      endDate: new Date('2026-11-25T08:01:00.000Z'),
    });
    const result = await new HealthDataRepository().createBulk([
      daily('user-a', 'STEPS', 'healthkit-daily-steps-2026-11-25', 299),
      daily('user-a', 'STEPS', 'healthkit-daily-steps-2026-11-25', 757),
      daily('user-a', 'ACTIVE_ENERGY', 'healthkit-daily-active-energy-2026-11-25', 500),
      daily('user-a', 'DISTANCE_WALKING_RUNNING', 'healthkit-daily-distance-2026-11-25', 4),
      raw('00000000-0000-4000-8000-000000000001', 50),
      raw('00000000-0000-4000-8000-000000000002', 60),
      raw('00000000-0000-4000-8000-000000000001', 100),
      daily('user-b', 'STEPS', 'healthkit-daily-steps-2026-11-25', 111),
    ], tx as never);

    expect(result).toEqual({ createdCount: 6, updatedCount: 1, skippedCount: 1 });
    expect(stored.size).toBe(6);
    expect(stored.get('user-a:healthkit-daily-steps-2026-11-25')?.value).toBe(757);
    expect(stored.get('user-b:healthkit-daily-steps-2026-11-25')?.value).toBe(111);
    expect(stored.get('user-a:00000000-0000-4000-8000-000000000001')?.value).toBe(50);
    expect(tx.healthData.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: expect.arrayContaining([
        expect.objectContaining({ sourceSampleId: '00000000-0000-4000-8000-000000000001' }),
        expect.objectContaining({ sourceSampleId: '00000000-0000-4000-8000-000000000002' }),
      ]),
    }));
    const rawRows = tx.healthData.createMany.mock.calls[0][0].data;
    expect(rawRows).toHaveLength(3);
    expect(rawRows.every((record) => !record.sourceSampleId?.startsWith('healthkit-daily-'))).toBe(true);
    expect(tx.healthData.update).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId_sourceSampleId: {
          userId: 'user-a',
          sourceSampleId: 'healthkit-daily-steps-2026-11-25',
        },
      },
      data: expect.objectContaining({ value: 757, unit: 'COUNT' }),
    }));
    expect(tx.healthData.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        startDate: new Date('2026-11-25T00:00:00.000Z'),
        endDate: new Date('2026-11-26T00:00:00.000Z'),
        syncedAt: expect.any(Date),
      }),
    }));
  });

  it('upserts timestamp-based aggregates without sending them to raw sample insertion', async () => {
    const stored = new Map<string, Record<string, any>>();
    const sourceSampleId = 'healthkit-daily-steps-1795554000';
    const record = (value: number) => ({
      userId: 'user-a',
      type: 'STEPS',
      unit: 'COUNT',
      sourceSampleId,
      sourceName: 'HealthKit daily aggregate',
      value,
      startDate: new Date('2026-11-24T21:00:00.000Z'),
      endDate: new Date('2026-11-25T21:00:00.000Z'),
    });
    const tx = {
      healthData: {
        createMany: vi.fn(async ({ data }: { data: Array<Record<string, any>> }) => {
          for (const item of data) stored.set(`${item.userId}:${item.sourceSampleId}`, item);
          return { count: data.length };
        }),
        findUnique: vi.fn(async () => stored.has(`user-a:${sourceSampleId}`) ? { id: 'existing-id' } : null),
        update: vi.fn(async ({ data }: { data: Record<string, any> }) => {
          const updated = { ...stored.get(`user-a:${sourceSampleId}`), ...data };
          stored.set(`user-a:${sourceSampleId}`, updated);
          return updated;
        }),
        create: vi.fn(async ({ data }: { data: Record<string, any> }) => {
          stored.set(`user-a:${sourceSampleId}`, data);
          return data;
        }),
      },
    };
    const repository = new HealthDataRepository();

    const first = await repository.createBulk([record(299)], tx as never);
    const second = await repository.createBulk([record(1103)], tx as never);

    expect(first).toEqual({ createdCount: 1, updatedCount: 0, skippedCount: 0 });
    expect(second).toEqual({ createdCount: 0, updatedCount: 1, skippedCount: 0 });
    expect(stored.size).toBe(1);
    expect(stored.get(`user-a:${sourceSampleId}`)?.value).toBe(1103);
    expect(tx.healthData.createMany).toHaveBeenNthCalledWith(1, { data: [], skipDuplicates: true });
    expect(tx.healthData.createMany).toHaveBeenNthCalledWith(2, { data: [], skipDuplicates: true });
  });

  it('uses the daily aggregate instead of double-counting raw samples for that day', async () => {
    const records = [
      {
        type: 'STEPS',
        value: 757,
        startDate: new Date('2026-11-25T00:00:00.000Z'),
        endDate: new Date('2026-11-26T00:00:00.000Z'),
        sourceSampleId: 'healthkit-daily-steps-2026-11-25',
      },
      {
        type: 'STEPS',
        value: 50,
        startDate: new Date('2026-11-25T08:00:00.000Z'),
        endDate: new Date('2026-11-25T08:01:00.000Z'),
        sourceSampleId: '00000000-0000-4000-8000-000000000001',
      },
      {
        type: 'STEPS',
        value: 120,
        startDate: new Date('2026-11-24T08:00:00.000Z'),
        endDate: new Date('2026-11-24T08:01:00.000Z'),
        sourceSampleId: '00000000-0000-4000-8000-000000000002',
      },
    ];
    const repository = new HealthDataRepository();
    Object.defineProperty(repository, 'model', {
      value: { findMany: vi.fn().mockResolvedValue(records) },
    });

    await expect(repository.getAggregateStats(
      'user-a',
      'STEPS',
      new Date('2026-11-24T00:00:00.000Z'),
      new Date('2026-11-26T00:00:00.000Z')
    )).resolves.toEqual({
      _sum: { value: 877 },
      _avg: { value: 438.5 },
      _min: { value: 120 },
      _max: { value: 757 },
    });
  });

  it('does not double-count raw samples alongside a timestamp-based daily aggregate', async () => {
    const records = [
      {
        type: 'STEPS',
        value: 1103,
        startDate: new Date('2026-11-24T21:00:00.000Z'),
        endDate: new Date('2026-11-25T21:00:00.000Z'),
        sourceSampleId: 'healthkit-daily-steps-1795554000',
      },
      {
        type: 'STEPS',
        value: 50,
        startDate: new Date('2026-11-25T08:00:00.000Z'),
        endDate: new Date('2026-11-25T08:01:00.000Z'),
        sourceSampleId: '00000000-0000-4000-8000-000000000001',
      },
    ];
    const repository = new HealthDataRepository();
    Object.defineProperty(repository, 'model', {
      value: { findMany: vi.fn().mockResolvedValue(records) },
    });

    await expect(repository.getAggregateStats(
      'user-a',
      'STEPS',
      new Date('2026-11-24T00:00:00.000Z'),
      new Date('2026-11-26T00:00:00.000Z')
    )).resolves.toMatchObject({ _sum: { value: 1103 } });
  });
});
