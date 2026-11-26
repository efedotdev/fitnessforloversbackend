import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';

describe('development password reset', () => {
  let app: FastifyInstance;
  let buildApp: typeof import('../src/app').buildApp;
  let config: typeof import('../src/config').config;
  let prisma: typeof import('../src/config/database').prisma;
  let authService: typeof import('../src/services').authService;
  let userRepository: typeof import('../src/repositories').userRepository;
  let currentPasswordHash: string;
  let tokenVersion: number;
  const originalNodeEnv = process.env.NODE_ENV;
  const user = {
    id: 'reset-user-id',
    email: 'user@example.com',
    name: 'User',
    avatarUrl: null,
    passwordHash: '',
    tokenVersion: 0,
    role: 'USER',
    appleUserId: null,
    emailVerified: false,
    createdAt: new Date('2026-11-25T00:00:00.000Z'),
    updatedAt: new Date('2026-11-25T00:00:00.000Z'),
    lastLoginAt: null,
  };

  const currentUser = () => ({
    ...user,
    passwordHash: currentPasswordHash,
    tokenVersion,
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/fitnessforlovers';
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-123456';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-123';
    vi.resetModules();

    [{ buildApp }, { config }, { prisma }, { authService }, { userRepository }] = await Promise.all([
      import('../src/app'),
      import('../src/config'),
      import('../src/config/database'),
      import('../src/services'),
      import('../src/repositories'),
    ]);

    config.NODE_ENV = 'development';
    app = await buildApp({ connectToDatabase: false });
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    currentPasswordHash = await bcrypt.hash('ExistingPassword123!', 12);
    tokenVersion = 0;
  });

  afterAll(async () => {
    await app.close();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('resets the password without issuing tokens and invalidates old access and refresh tokens', async () => {
    const findByEmail = vi.spyOn(userRepository, 'findByEmail').mockImplementation(async () => currentUser() as never);
    vi.spyOn(userRepository, 'updatePasswordAndIncrementTokenVersion').mockImplementation(async (_id, hash) => {
      currentPasswordHash = hash;
      tokenVersion += 1;
      return currentUser() as never;
    });
    vi.spyOn(userRepository, 'updateLastLogin').mockImplementation(async () => currentUser() as never);
    vi.spyOn(userRepository, 'findById').mockImplementation(async () => currentUser() as never);
    vi.spyOn(prisma.user, 'findUnique').mockImplementation(async () => ({
      id: user.id,
      email: user.email,
      appleUserId: null,
      role: user.role,
      tokenVersion,
    }) as never);

    const oldAccessToken = app.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: 0,
    });
    const oldRefreshToken = app.jwt.sign(
      { sub: user.id, type: 'refresh', tokenVersion: 0 },
      { key: config.JWT_REFRESH_SECRET, expiresIn: config.JWT_REFRESH_EXPIRES_IN },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/auth/dev-reset-password',
      payload: {
        email: ' USER@Example.com ',
        newPassword: 'NewStrongPassword123!',
        confirmPassword: 'NewStrongPassword123!',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: { message: 'Password reset successfully' },
    });
    expect(response.body).not.toContain('NewStrongPassword123!');
    expect(response.body).not.toContain('passwordHash');
    expect(response.json().data).not.toHaveProperty('tokens');
    expect(tokenVersion).toBe(1);
    expect(findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(await bcrypt.compare('NewStrongPassword123!', currentPasswordHash)).toBe(true);

    const oldPasswordLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'ExistingPassword123!' },
    });
    expect(oldPasswordLogin.statusCode).toBe(401);

    const newPasswordLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'NewStrongPassword123!' },
    });
    expect(newPasswordLogin.statusCode).toBe(200);
    expect(newPasswordLogin.json().data.tokens).toBeDefined();

    const oldAccessResponse = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${oldAccessToken}` },
    });
    expect(oldAccessResponse.statusCode).toBe(401);

    const oldRefreshResponse = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: oldRefreshToken },
    });
    expect(oldRefreshResponse.statusCode).toBe(401);
  });

  it('returns an error when the email is not registered', async () => {
    vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/dev-reset-password',
      payload: {
        email: 'missing@example.com',
        newPassword: 'NewStrongPassword123!',
        confirmPassword: 'NewStrongPassword123!',
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects mismatched and weak passwords before calling the service', async () => {
    const resetPassword = vi.spyOn(authService, 'devResetPassword');
    const mismatch = await app.inject({
      method: 'POST',
      url: '/auth/dev-reset-password',
      payload: {
        email: 'user@example.com',
        newPassword: 'NewStrongPassword123!',
        confirmPassword: 'DifferentPassword123!',
      },
    });
    const weakPassword = await app.inject({
      method: 'POST',
      url: '/auth/dev-reset-password',
      payload: {
        email: 'user@example.com',
        newPassword: 'short',
        confirmPassword: 'short',
      },
    });

    expect(mismatch.statusCode).toBe(400);
    expect(weakPassword.statusCode).toBe(400);
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('publishes the request and response schemas in development OpenAPI documentation', async () => {
    const response = await app.inject({ method: 'GET', url: '/documentation/json' });
    const contract = response.json();
    const operation = contract.paths['/auth/dev-reset-password'].post;

    expect(response.statusCode).toBe(200);
    expect(operation.security).toEqual([]);
    expect(operation.requestBody.content['application/json'].schema.properties)
      .toHaveProperty('confirmPassword');
    expect(operation.requestBody.content['application/json'].schema.properties)
      .toHaveProperty('newPassword');
    expect(operation.responses['200'].content['application/json'].schema).toBeDefined();
    expect(JSON.stringify(operation)).not.toContain('passwordHash');
  });

  it('does not register the endpoint in production', async () => {
    config.NODE_ENV = 'production';
    const productionApp = await buildApp({ connectToDatabase: false });
    const response = await productionApp.inject({
      method: 'POST',
      url: '/auth/dev-reset-password',
      payload: {
        email: 'user@example.com',
        newPassword: 'NewStrongPassword123!',
        confirmPassword: 'NewStrongPassword123!',
      },
    });

    expect(response.statusCode).toBe(404);
    await productionApp.close();
    config.NODE_ENV = 'development';
  });
});
