import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

describe('V1 backend services', () => {
  let PairingService: typeof import('../src/services/pairing.service').PairingService;
  let HealthDataService: typeof import('../src/services/health-data.service').HealthDataService;
  let GoalService: typeof import('../src/services/goal.service').GoalService;
  let DashboardService: typeof import('../src/services/dashboard.service').DashboardService;
  let getTimeZoneDayRange: typeof import('../src/services/dashboard.service').getTimeZoneDayRange;
  let pairingRepository: typeof import('../src/repositories').pairingRepository;
  let userRepository: typeof import('../src/repositories').userRepository;
  let healthDataRepository: typeof import('../src/repositories').healthDataRepository;
  let goalRepository: typeof import('../src/repositories').goalRepository;
  let goalService: typeof import('../src/services').goalService;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/fitnessforlovers';
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-123456';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-123';
    process.env.APPLE_BUNDLE_ID = 'com.example.fitnessforlovers';

    ({ PairingService } = await import('../src/services/pairing.service'));
    ({ HealthDataService } = await import('../src/services/health-data.service'));
    ({ GoalService } = await import('../src/services/goal.service'));
    ({ DashboardService, getTimeZoneDayRange } = await import('../src/services/dashboard.service'));
    ({ pairingRepository, userRepository, healthDataRepository, goalRepository } = await import('../src/repositories'));
    ({ goalService } = await import('../src/services'));
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('rejects pairing with the current user', async () => {
    vi.spyOn(userRepository, 'findByEmail').mockResolvedValue({ id: 'user-a' } as never);

    await expect(new PairingService().createInvitation('user-a', {
      inviteeEmail: 'user@example.com',
      sharingScope: 'ACTIVITY_ONLY',
    })).rejects.toMatchObject({ statusCode: 400, message: 'Cannot pair with yourself' });
  });

  it('rejects duplicate pending pair invitations in either direction', async () => {
    vi.spyOn(userRepository, 'findByEmail').mockResolvedValue({ id: 'user-b' } as never);
    vi.spyOn(pairingRepository, 'findBetweenUsers').mockResolvedValue({
      id: 'pairing-id',
      status: 'PENDING',
    } as never);
    const createPairing = vi.spyOn(pairingRepository, 'create');

    await expect(new PairingService().createInvitation('user-a', {
      inviteeEmail: 'user-b@example.com',
      sharingScope: 'ACTIVITY_ONLY',
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(createPairing).not.toHaveBeenCalled();
  });

  it('returns both users when creating a pairing invitation', async () => {
    vi.spyOn(userRepository, 'findByEmail').mockResolvedValue({
      id: 'user-b',
      email: 'user-b@example.com',
    } as never);
    vi.spyOn(pairingRepository, 'findBetweenUsers').mockResolvedValue(null);
    const createWithUsers = vi.spyOn(pairingRepository, 'createWithUsers').mockResolvedValue({
      id: 'pairing-id',
      user1Id: 'user-a',
      user2Id: 'user-b',
      status: 'PENDING',
      sharingScope: 'ACTIVITY_ONLY',
      customTypes: [],
      user1: { id: 'user-a', name: 'A', avatarUrl: null, email: 'a@example.com' },
      user2: { id: 'user-b', name: 'B', avatarUrl: null, email: 'b@example.com' },
    } as never);

    const result = await new PairingService().createInvitation('user-a', {
      inviteeEmail: 'user-b@example.com',
      sharingScope: 'ACTIVITY_ONLY',
    });

    expect(createWithUsers).toHaveBeenCalledWith(expect.objectContaining({
      pairKey: 'user-a:user-b',
    }));
    expect(result).toMatchObject({
      user1: { id: 'user-a' },
      user2: { id: 'user-b' },
      partner: { id: 'user-b' },
      isInviter: true,
    });
  });

  it('does not disclose a pairing to a non-member', async () => {
    vi.spyOn(pairingRepository, 'findByIdWithUsers').mockResolvedValue({
      id: 'pairing-id',
      user1Id: 'user-a',
      user2Id: 'user-b',
    } as never);

    await expect(new PairingService().getPairingById('stranger', 'pairing-id'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('uses the sample identifier and duplicate skipping for bulk health sync', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const createSyncLog = vi.fn().mockResolvedValue({});
    vi.spyOn(healthDataRepository, 'transaction').mockImplementation((callback) => callback({
      healthData: { createMany },
      syncLog: { create: createSyncLog },
    } as never));

    const result = await new HealthDataService().bulkCreate('user-a', {
      data: [{
        type: 'STEPS',
        unit: 'COUNT',
        value: 8000,
        startDate: '2026-11-24T08:00:00.000Z',
        endDate: '2026-11-24T09:00:00.000Z',
        sourceSampleId: 'healthkit-sample-id',
      }],
    });

    expect(result).toEqual({ synced: 1 });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: [expect.objectContaining({
        userId: 'user-a',
        sourceSampleId: 'healthkit-sample-id',
      })],
    }));
    expect(createSyncLog).toHaveBeenCalledOnce();
  });

  it('records a failed sync and preserves the original health sync error', async () => {
    const failure = new Error('sync failed');
    vi.spyOn(healthDataRepository, 'transaction').mockRejectedValue(failure);
    const recordFailure = vi.spyOn(healthDataRepository, 'createFailedSyncLog').mockResolvedValue();

    await expect(new HealthDataService().bulkCreate('user-a', {
      data: [{
        type: 'STEPS',
        unit: 'COUNT',
        value: 8000,
        startDate: '2026-11-24T08:00:00.000Z',
        endDate: '2026-11-24T09:00:00.000Z',
        sourceSampleId: 'healthkit-sample-id',
      }],
    })).rejects.toBe(failure);
    expect(recordFailure).toHaveBeenCalledWith('user-a', expect.any(Date), 'sync failed');
  });

  it('returns aggregate buckets instead of treating them as raw health records', async () => {
    vi.spyOn(healthDataRepository, 'findByUserAndDateRange').mockResolvedValue({
      data: [{
        type: 'STEPS',
        value: 1200,
        startDate: new Date('2026-11-24T08:00:00.000Z'),
      }] as never,
      total: 1,
    });

    const result = await new HealthDataService().getMyData('user-a', {
      limit: 100,
      offset: 0,
      aggregate: 'daily',
    });

    expect(result.data).toEqual([{
      bucket: '2026-11-24',
      STEPS: { count: 1, sum: 1200, avg: 1200, min: 1200, max: 1200 },
    }]);
  });

  it('requires an accepted pairing before creating a shared goal', async () => {
    vi.spyOn(pairingRepository, 'findByIdWithUsers').mockResolvedValue(null);
    const createGoal = vi.spyOn(goalRepository, 'create');

    await expect(new GoalService().create('user-a', {
      pairingId: 'clx1234567890123456789012',
      title: 'Shared steps',
      targetValue: 20000,
      startDate: '2026-11-24T00:00:00.000Z',
      endDate: '2026-11-30T23:59:59.000Z',
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(createGoal).not.toHaveBeenCalled();
  });

  it('calculates shared progress from both users and caps the displayed percentage', async () => {
    vi.spyOn(goalRepository, 'findById').mockResolvedValue({
      id: 'goal-id',
      pairingId: 'pairing-id',
      createdById: 'user-a',
      title: 'Shared steps',
      targetValue: 20000,
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-12-01T00:00:00.000Z'),
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
      updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    } as never);
    vi.spyOn(pairingRepository, 'findByIdWithUsers').mockResolvedValue({
      id: 'pairing-id',
      user1Id: 'user-a',
      user2Id: 'user-b',
      status: 'ACCEPTED',
      sharingScope: 'ACTIVITY_ONLY',
      customTypes: [],
    } as never);
    const sumSteps = vi.spyOn(healthDataRepository, 'sumStepsForUsersBetween').mockResolvedValue(25000);

    const progress = await new GoalService().getById('user-a', 'goal-id');

    expect(sumSteps).toHaveBeenCalledWith(['user-a', 'user-b'], expect.any(Date), expect.any(Date));
    expect(progress).toMatchObject({
      currentValue: 25000,
      remainingValue: 0,
      progressPercentage: 100,
      completed: true,
    });
  });

  it('returns an empty-partner dashboard when no accepted pairing exists', async () => {
    vi.spyOn(userRepository, 'findWithPreferences').mockResolvedValue({
      id: 'user-a',
      preferences: { timezone: 'UTC' },
    } as never);
    vi.spyOn(healthDataRepository, 'getAggregateStats').mockResolvedValue({
      _sum: { value: 123 },
      _avg: { value: 1 },
      _max: { value: 2 },
      _min: { value: 0 },
    });
    vi.spyOn(healthDataRepository, 'getLatestSync').mockResolvedValue(null);
    vi.spyOn(pairingRepository, 'findAcceptedByUser').mockResolvedValue([]);
    vi.spyOn(goalService, 'listForUser').mockResolvedValue([]);

    const result = await new DashboardService().getDashboard('user-a');

    expect(result.partner).toBeNull();
    expect(result.goals).toEqual([]);
    expect(result.summary).toMatchObject({ steps: 123, activeEnergy: 123, distance: 123 });
    expect(result.sync).toEqual({ lastSyncedAt: null, status: null });
  });

  it('omits dashboard partner metrics not allowed by the accepted sharing scope', async () => {
    vi.spyOn(userRepository, 'findWithPreferences').mockResolvedValue({
      id: 'user-a',
      preferences: { timezone: 'UTC' },
    } as never);
    vi.spyOn(healthDataRepository, 'getAggregateStats').mockResolvedValue({
      _sum: { value: 10 },
      _avg: { value: 1 },
      _max: { value: 2 },
      _min: { value: 0 },
    });
    vi.spyOn(healthDataRepository, 'getLatestSync').mockResolvedValue(null);
    vi.spyOn(pairingRepository, 'findAcceptedByUser').mockResolvedValue([{
      id: 'pairing-id',
      user1Id: 'user-a',
      user2Id: 'user-b',
      status: 'ACCEPTED',
      sharingScope: 'HEART_ONLY',
      customTypes: [],
      user1: { id: 'user-a', name: 'A', avatarUrl: null },
      user2: { id: 'user-b', name: 'B', avatarUrl: null },
    }] as never);
    vi.spyOn(goalService, 'listForUser').mockResolvedValue([]);

    const result = await new DashboardService().getDashboard('user-a');

    expect(result.partner?.summary).toEqual({
      date: expect.any(String),
      sharingScope: 'HEART_ONLY',
    });
  });

  it('uses the configured local calendar day across daylight-saving boundaries', () => {
    const date = new Date('2026-03-08T12:00:00.000Z');
    const range = getTimeZoneDayRange(date, 'America/Los_Angeles');
    expect(range.date).toBe('2026-03-08');
    expect(range.start.toISOString()).toBe('2026-03-08T08:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-03-09T06:59:59.999Z');
  });
});
