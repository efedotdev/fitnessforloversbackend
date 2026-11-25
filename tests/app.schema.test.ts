import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const userId = 'test-user-id';
const pairingId = 'c123456789012345678901234';
const now = new Date('2026-11-25T00:00:00.000Z');

const pairing = {
  id: pairingId,
  user1Id: userId,
  user2Id: 'partner-id',
  status: 'PENDING',
  sharingScope: 'ACTIVITY_ONLY',
  customTypes: [],
  invitedAt: now,
  acceptedAt: null,
  rejectedAt: null,
  expiresAt: now,
  createdAt: now,
  updatedAt: now,
  user1: { id: userId, name: 'User', avatarUrl: null, email: 'user@example.com' },
  user2: { id: 'partner-id', name: 'Partner', avatarUrl: null, email: 'partner@example.com' },
  partner: { id: 'partner-id', name: 'Partner', avatarUrl: null, email: 'partner@example.com' },
  isInviter: true,
};

const goal = {
  id: 'goal-id',
  pairingId,
  createdById: userId,
  title: 'Daily steps',
  targetValue: 1000,
  startDate: now,
  endDate: now,
  createdAt: now,
  updatedAt: now,
  currentValue: 100,
  remainingValue: 900,
  progressPercentage: 10,
  completed: false,
};

const device = {
  id: 'device-record-id',
  userId,
  deviceId: 'ios-device',
  platform: 'IOS',
  model: null,
  osVersion: null,
  appVersion: null,
  pushToken: null,
  isActive: true,
  lastSyncAt: now,
  createdAt: now,
  updatedAt: now,
};

const preferences = {
  id: 'preferences-id',
  userId,
  sharingScope: 'ACTIVITY_ONLY',
  customDataTypes: [],
  notifyOnNewData: true,
  notifyOnPartnerActive: true,
  weeklyDigest: false,
  timezone: 'UTC',
  language: 'en',
  createdAt: now,
  updatedAt: now,
};

const authResponse = {
  user: {
    id: userId,
    name: 'User',
    email: 'user@example.com',
    avatarUrl: null,
    createdAt: now,
  },
  tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
};

describe('Zod route schema compatibility', () => {
  let app: FastifyInstance;
  let authToken: string;
  let services: typeof import('../src/services');
  let prisma: typeof import('../src/config/database').prisma;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/fitnessforlovers';
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-123456';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-123';
    process.env.APPLE_BUNDLE_ID = 'com.example.fitnessforlovers';
    process.env.LOG_LEVEL = 'debug';
    vi.resetModules();

    const [{ buildApp }, loadedServices, database] = await Promise.all([
      import('../src/app'),
      import('../src/services'),
      import('../src/config/database'),
    ]);

    services = loadedServices;
    prisma = database.prisma;
    app = await buildApp({ connectToDatabase: false });
    authToken = app.jwt.sign({
      sub: userId,
      email: 'user@example.com',
      role: 'USER',
      tokenVersion: 0,
    });

    app.get('/health/schema-infrastructure-error', async () => {
      throw new TypeError('schema.parse is not a function');
    });
  });

  beforeEach(() => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      appleUserId: null,
      role: 'USER',
      tokenVersion: 0,
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const authorized = () => ({
    authorization: `Bearer ${authToken}`,
  });

  it('audits every active route request and response schema during test registration', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });

  it('validates pairing requests and serializes the declared response', async () => {
    const createInvitation = vi.spyOn(services.pairingService, 'createInvitation')
      .mockResolvedValue(pairing as never);

    const valid = await app.inject({
      method: 'POST',
      url: '/pairings',
      headers: authorized(),
      payload: {
        inviteeEmail: 'partner@example.com',
        sharingScope: 'ACTIVITY_ONLY',
      },
    });

    expect(valid.statusCode).toBe(201);
    expect(createInvitation).toHaveBeenCalledWith(userId, {
      inviteeEmail: 'partner@example.com',
      sharingScope: 'ACTIVITY_ONLY',
    });
    expect(valid.json().data.pairing.id).toBe(pairingId);

    const defaulted = await app.inject({
      method: 'POST',
      url: '/pairings',
      headers: authorized(),
      payload: { inviteeEmail: 'partner@example.com' },
    });
    expect(defaulted.statusCode).toBe(201);
    expect(createInvitation).toHaveBeenLastCalledWith(userId, {
      inviteeEmail: 'partner@example.com',
      sharingScope: 'ACTIVITY_ONLY',
    });

    const invalid = await app.inject({
      method: 'POST',
      url: '/pairings',
      headers: authorized(),
      payload: { inviteeEmail: 'not-an-email' },
    });

    expect(invalid.statusCode).toBe(400);
    expect(createInvitation).toHaveBeenCalledTimes(2);
  });

  it('validates pairing response and update payloads', async () => {
    const respond = vi.spyOn(services.pairingService, 'respondToInvitation')
      .mockResolvedValue(pairing as never);
    const validResponse = await app.inject({
      method: 'POST',
      url: `/pairings/${pairingId}/respond`,
      headers: authorized(),
      payload: { action: 'ACCEPT' },
    });
    expect(validResponse.statusCode).toBe(200);

    const invalidResponse = await app.inject({
      method: 'POST',
      url: `/pairings/${pairingId}/respond`,
      headers: authorized(),
      payload: { action: 'MAYBE' },
    });
    expect(invalidResponse.statusCode).toBe(400);
    expect(respond).toHaveBeenCalledTimes(1);

    const update = vi.spyOn(services.pairingService, 'updatePairing')
      .mockResolvedValue(pairing as never);
    const validUpdate = await app.inject({
      method: 'PATCH',
      url: `/pairings/${pairingId}`,
      headers: authorized(),
      payload: { sharingScope: 'SLEEP_ONLY' },
    });
    expect(validUpdate.statusCode).toBe(200);

    const invalidUpdate = await app.inject({
      method: 'PATCH',
      url: `/pairings/${pairingId}`,
      headers: authorized(),
      payload: { sharingScope: 'INVALID' },
    });
    expect(invalidUpdate.statusCode).toBe(400);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('validates health-data creation and serializes its DTO response', async () => {
    const healthDataService = vi.spyOn(services.healthDataService, 'create').mockResolvedValue({
      id: 'health-data-id',
      userId,
      type: 'STEPS',
      unit: 'COUNT',
      value: 100,
      startDate: now,
      endDate: now,
      sourceName: null,
      sourceVersion: null,
      deviceId: null,
      sourceSampleId: null,
      metadata: null,
      syncedAt: now,
      createdAt: now,
    });

    const valid = await app.inject({
      method: 'POST',
      url: '/health-data',
      headers: authorized(),
      payload: {
        type: 'STEPS',
        unit: 'COUNT',
        value: 100,
        startDate: now.toISOString(),
        endDate: now.toISOString(),
      },
    });
    expect(valid.statusCode).toBe(201);

    const invalid = await app.inject({
      method: 'POST',
      url: '/health-data',
      headers: authorized(),
      payload: { type: 'STEPS', unit: 'COUNT', value: '100' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(healthDataService).toHaveBeenCalledTimes(1);
  });

  it('validates bulk health data before invoking the service', async () => {
    const bulkCreate = vi.spyOn(services.healthDataService, 'bulkCreate')
      .mockResolvedValue({ synced: 1 });
    const unauthorized = await app.inject({
      method: 'POST',
      url: '/health-data/bulk',
      payload: { data: [] },
    });
    expect(unauthorized.statusCode).toBe(401);

    const valid = await app.inject({
      method: 'POST',
      url: '/health-data/bulk',
      headers: authorized(),
      payload: {
        data: [{
          type: 'STEPS',
          unit: 'COUNT',
          value: 100,
          startDate: now.toISOString(),
          endDate: now.toISOString(),
        }],
      },
    });

    expect(valid.statusCode, valid.body).toBe(200);
    expect(valid.json().data.synced).toBe(1);

    const invalid = await app.inject({
      method: 'POST',
      url: '/health-data/bulk',
      headers: authorized(),
      payload: { data: [] },
    });

    expect(invalid.statusCode).toBe(400);
    expect(bulkCreate).toHaveBeenCalledTimes(1);
  });

  it('validates goal creation and update request bodies', async () => {
    const createGoal = vi.spyOn(services.goalService, 'create').mockResolvedValue(goal);
    const valid = await app.inject({
      method: 'POST',
      url: '/goals',
      headers: authorized(),
      payload: {
        pairingId,
        title: 'Daily steps',
        targetValue: 1000,
        startDate: now.toISOString(),
        endDate: now.toISOString(),
      },
    });

    expect(valid.statusCode).toBe(201);

    const updateGoal = vi.spyOn(services.goalService, 'update').mockResolvedValue(goal);
    const validUpdate = await app.inject({
      method: 'PATCH',
      url: `/goals/${pairingId}`,
      headers: authorized(),
      payload: { title: 'Updated goal' },
    });
    expect(validUpdate.statusCode).toBe(200);

    const invalid = await app.inject({
      method: 'PATCH',
      url: `/goals/${pairingId}`,
      headers: authorized(),
      payload: { targetValue: -1 },
    });

    expect(invalid.statusCode).toBe(400);
    expect(createGoal).toHaveBeenCalledTimes(1);
    expect(updateGoal).toHaveBeenCalledTimes(1);
  });

  it('validates profile and preference request bodies', async () => {
    const updatePreferences = vi.spyOn(services.userService, 'updatePreferences')
      .mockResolvedValue(preferences as never);
    const valid = await app.inject({
      method: 'PATCH',
      url: '/users/me/preferences',
      headers: authorized(),
      payload: { sharingScope: 'ACTIVITY_ONLY' },
    });

    expect(valid.statusCode).toBe(200);

    const invalid = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      headers: authorized(),
      payload: { name: '' },
    });
    const invalidPreferences = await app.inject({
      method: 'PATCH',
      url: '/users/me/preferences',
      headers: authorized(),
      payload: { sharingScope: 'UNSUPPORTED' },
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalidPreferences.statusCode).toBe(400);
    expect(updatePreferences).toHaveBeenCalledTimes(1);
  });

  it('validates device registration and notification query input', async () => {
    const registerDevice = vi.spyOn(services.deviceService, 'register')
      .mockResolvedValue(device as never);
    const valid = await app.inject({
      method: 'POST',
      url: '/devices',
      headers: authorized(),
      payload: { deviceId: 'ios-device' },
    });

    expect(valid.statusCode).toBe(201);

    const invalidDevice = await app.inject({
      method: 'POST',
      url: '/devices',
      headers: authorized(),
      payload: { deviceId: '', platform: 'IOS' },
    });
    expect(invalidDevice.statusCode).toBe(400);
    expect(registerDevice).toHaveBeenCalledTimes(1);

    const invalidNotificationQuery = await app.inject({
      method: 'GET',
      url: '/notifications?limit=0',
      headers: authorized(),
    });
    expect(invalidNotificationQuery.statusCode).toBe(400);

    const updateDevice = vi.spyOn(services.deviceService, 'updateDevice')
      .mockResolvedValue(device as never);
    const validUpdate = await app.inject({
      method: 'PATCH',
      url: '/devices/ios-device',
      headers: authorized(),
      payload: { isActive: false },
    });
    expect(validUpdate.statusCode).toBe(200);

    const invalidUpdate = await app.inject({
      method: 'PATCH',
      url: '/devices/ios-device',
      headers: authorized(),
      payload: { isActive: 'false' },
    });
    expect(invalidUpdate.statusCode).toBe(400);
    expect(updateDevice).toHaveBeenCalledTimes(1);

    const markAsRead = vi.spyOn(services.notificationService, 'markAsRead')
      .mockResolvedValue({
        id: pairingId,
        userId,
        title: 'Update',
        body: 'A new update is available.',
        data: null,
        read: true,
        sentAt: now,
        createdAt: now,
      });
    const validNotification = await app.inject({
      method: 'PATCH',
      url: `/notifications/${pairingId}/read`,
      headers: authorized(),
    });
    expect(validNotification.statusCode).toBe(200);

    const invalidNotification = await app.inject({
      method: 'PATCH',
      url: '/notifications/not-a-cuid/read',
      headers: authorized(),
    });
    expect(invalidNotification.statusCode).toBe(400);
    expect(markAsRead).toHaveBeenCalledTimes(1);
  });

  it('validates auth login and refresh payloads and preserves response serialization', async () => {
    const login = vi.spyOn(services.authService, 'login').mockResolvedValue(authResponse);
    const validLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@example.com', password: 'strong-password' },
    });
    expect(validLogin.statusCode).toBe(200);

    const invalidLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@example.com', password: '' },
    });
    expect(invalidLogin.statusCode).toBe(400);
    expect(login).toHaveBeenCalledTimes(1);

    const refresh = vi.spyOn(services.authService, 'refreshToken').mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    const validRefresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'valid-refresh-token' },
    });
    expect(validRefresh.statusCode).toBe(200);

    const invalidRefresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {},
    });
    expect(invalidRefresh.statusCode).toBe(400);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps schema infrastructure failures as safe 500 responses', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/schema-infrastructure-error',
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('schema.parse is not a function');
    expect(response.body).not.toContain('"stack"');
  });
});
