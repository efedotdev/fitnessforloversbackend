import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.HEALTH_DATA_TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

integrationDescribe('HealthKit daily aggregate bulk sync (PostgreSQL integration)', () => {
  let prisma: PrismaClient | undefined;
  let bulkCreate: typeof import('../src/services/health-data.service').healthDataService.bulkCreate | undefined;
  let getDashboard: typeof import('../src/services/dashboard.service').dashboardService.getDashboard | undefined;
  let getPartnerSummary: typeof import('../src/services/health-data.service').healthDataService.getPartnerSummary | undefined;
  const userIds: string[] = [];

  beforeAll(async () => {
    if (!databaseUrl) return;
    const databaseHost = new URL(databaseUrl).hostname;
    if (!['localhost', '127.0.0.1', '::1'].includes(databaseHost)) {
      throw new Error('HEALTH_DATA_TEST_DATABASE_URL must point to a local PostgreSQL database');
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'integration-test-jwt-secret-that-is-long-enough';
    process.env.JWT_REFRESH_SECRET = 'integration-test-refresh-secret-that-is-long';
    ({ prisma } = await import('../src/config/database'));
    ({ healthDataService: { bulkCreate, getPartnerSummary } } = await import('../src/services/health-data.service'));
    ({ dashboardService: { getDashboard } } = await import('../src/services/dashboard.service'));
    if (!prisma) throw new Error('Integration database client failed to initialize');
    await prisma.$connect();
  });

  afterAll(async () => {
    if (!databaseUrl || !prisma) return;
    if (userIds.length) {
      await prisma.syncLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  });

  it('updates one daily row, keeps raw samples idempotent, and exposes the latest total', async () => {
    const suffix = randomUUID();
    if (!prisma || !bulkCreate || !getDashboard || !getPartnerSummary) {
      throw new Error('Integration database is not initialized');
    }
    const user = await prisma.user.create({ data: { email: `health-sync-${suffix}@example.invalid` } });
    const partner = await prisma.user.create({ data: { email: `health-partner-${suffix}@example.invalid` } });
    userIds.push(user.id, partner.id);
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const startDate = new Date(`${date}T00:00:00.000Z`);
    const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    const aggregateStartDate = new Date(startDate.getTime() - 3 * 60 * 60 * 1000);
    const aggregateEndDate = new Date(endDate.getTime() - 3 * 60 * 60 * 1000);
    const sourceSampleId = `healthkit-daily-steps-${Math.floor(aggregateStartDate.getTime() / 1000)}`;
    await prisma.userPreferences.create({ data: { userId: user.id, timezone: 'UTC' } });
    await prisma.userPreferences.create({ data: { userId: partner.id, timezone: 'UTC' } });
    await prisma.pairing.create({
      data: {
        user1Id: user.id,
        user2Id: partner.id,
        status: 'ACCEPTED',
        sharingScope: 'ACTIVITY_ONLY',
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    const dailyRecord = (value: number) => ({
      type: 'STEPS' as const,
      unit: 'COUNT' as const,
      value,
      startDate: aggregateStartDate.toISOString(),
      endDate: aggregateEndDate.toISOString(),
      sourceName: 'HealthKit daily aggregate',
      sourceSampleId,
    });
    const first = await bulkCreate(user.id, { data: [dailyRecord(299)] });
    expect(first).toMatchObject({
      receivedCount: 1, createdCount: 1, updatedCount: 0, skippedCount: 0, rejectedCount: 0,
    });
    await expect(prisma.healthData.count({ where: { userId: user.id } })).resolves.toBe(1);
    await expect(prisma.healthData.findUnique({
      where: { userId_sourceSampleId: { userId: user.id, sourceSampleId } },
    })).resolves.toMatchObject({ value: 299 });

    const updated = await bulkCreate(user.id, { data: [dailyRecord(1103)] });
    expect(updated).toMatchObject({
      receivedCount: 1, createdCount: 0, updatedCount: 1, skippedCount: 0, rejectedCount: 0,
    });
    await expect(prisma.healthData.findMany({ where: { userId: user.id, type: 'STEPS' } }))
      .resolves.toHaveLength(1);
    await expect(prisma.healthData.findUnique({
      where: { userId_sourceSampleId: { userId: user.id, sourceSampleId } },
    })).resolves.toMatchObject({ value: 1103 });
    await expect(prisma.syncLog.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })).resolves.toMatchObject({ recordsCount: 1 });

    const repeated = await bulkCreate(user.id, { data: [dailyRecord(1103)] });
    expect(repeated).toMatchObject({ createdCount: 0, updatedCount: 1, skippedCount: 0 });
    await expect(prisma.healthData.count({ where: { userId: user.id } })).resolves.toBe(1);
    const rawSamples = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ].map((id, index) => ({
      type: 'STEPS' as const,
      unit: 'COUNT' as const,
      value: 30 + index,
      startDate: new Date(startDate.getTime() + (index + 1) * 60 * 60 * 1000).toISOString(),
      endDate: new Date(startDate.getTime() + (index + 1) * 60 * 60 * 1000 + 60_000).toISOString(),
      sourceName: 'HealthKit',
      sourceSampleId: id,
    }));
    expect(await bulkCreate(user.id, { data: rawSamples })).toMatchObject({
      createdCount: 2, updatedCount: 0, skippedCount: 0,
    });
    const duplicateRawResult = await bulkCreate(user.id, {
      data: [{ ...rawSamples[0], value: 999 }],
    });
    expect(duplicateRawResult).toMatchObject({
      createdCount: 0, updatedCount: 0, skippedCount: 1, rejectedCount: 0,
    });
    await bulkCreate(partner.id, { data: [dailyRecord(111)] });

    await expect(prisma.healthData.count({ where: { userId: user.id } })).resolves.toBe(3);
    await expect(prisma.healthData.findUnique({
      where: {
        userId_sourceSampleId: {
          userId: user.id,
          sourceSampleId: rawSamples[0].sourceSampleId,
        },
      },
    })).resolves.toMatchObject({ value: 30 });
    await expect(getDashboard(user.id)).resolves.toMatchObject({
      summary: { steps: 1103 },
      partner: { summary: { steps: 111 } },
    });
    await expect(getPartnerSummary(partner.id, user.id)).resolves.toMatchObject({
      summary: {
        metrics: [expect.objectContaining({ type: 'STEPS', _sum: { value: 1103 } })],
      },
    });
  });
});
