import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonWebTokenError } from 'jsonwebtoken';

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock('apple-signin-auth', () => ({
  default: { verifyIdToken },
}));

describe('verifyAppleIdentityToken', () => {
  let AuthService: typeof import('../src/services/auth.service').AuthService;
  let BadRequestError: typeof import('../src/exceptions').BadRequestError;
  let ConflictError: typeof import('../src/exceptions').ConflictError;
  let config: typeof import('../src/config').config;
  let userRepository: typeof import('../src/repositories').userRepository;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/fitnessforlovers';
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-123456';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-123';
    process.env.APPLE_BUNDLE_ID = 'com.example.fitnessforlovers';

    ({ AuthService } = await import('../src/services/auth.service'));
    ({ BadRequestError } = await import('../src/exceptions'));
    ({ ConflictError } = await import('../src/exceptions'));
    ({ config } = await import('../src/config'));
    ({ userRepository } = await import('../src/repositories'));
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('verifies the identity token against the configured app audience', async () => {
    verifyIdToken.mockResolvedValue({
      sub: 'verified-apple-user',
      email: 'user@example.com',
      email_verified: true,
    });

    const result = await new AuthService().verifyAppleToken({ identityToken: 'signed-identity-token' });

    expect(verifyIdToken).toHaveBeenCalledWith('signed-identity-token', {
      audience: 'com.example.fitnessforlovers',
    });
    expect(result).toEqual({ valid: true, appleUserId: 'verified-apple-user' });
  });

  it('rejects invalid signatures as a client authentication error', async () => {
    verifyIdToken.mockRejectedValue(new JsonWebTokenError('invalid signature'));

    await expect(new AuthService().verifyAppleToken({ identityToken: 'forged-token' }))
      .rejects.toBeInstanceOf(BadRequestError);
  });

  it('fails closed when the Apple audience is not configured', async () => {
    const originalAudience = config.APPLE_BUNDLE_ID;
    config.APPLE_BUNDLE_ID = undefined;

    try {
      await expect(new AuthService().verifyAppleToken({ identityToken: 'signed-identity-token' }))
        .rejects.toThrow('Apple Sign In is not configured');
      expect(verifyIdToken).not.toHaveBeenCalled();
    } finally {
      config.APPLE_BUNDLE_ID = originalAudience;
    }
  });

  it('uses the configured refresh-token lifetime while verifying refresh tokens', async () => {
    const verify = vi.fn().mockReturnValue({ sub: 'user-id', type: 'refresh' });
    vi.spyOn(userRepository, 'findById').mockResolvedValue(null);

    await expect(new AuthService().refreshToken(
      { refreshToken: 'refresh-token' },
      { jwt: { verify } } as never,
    )).rejects.toThrow('User not found');

    expect(verify).toHaveBeenCalledWith('refresh-token', {
      maxAge: config.JWT_REFRESH_EXPIRES_IN,
      key: config.JWT_REFRESH_SECRET,
    });
  });

  it('uses the verified Apple email rather than the request email', async () => {
    const appleUser = {
      id: 'user-id',
      email: 'verified@example.com',
      name: null,
      avatarUrl: null,
      appleUserId: 'apple-user-id',
      role: 'USER',
      emailVerified: true,
      createdAt: new Date(),
      lastLoginAt: null,
    };
    const createUser = vi.spyOn(userRepository, 'createWithPreferences').mockResolvedValue(appleUser as never);
    vi.spyOn(userRepository, 'findByAppleId').mockResolvedValue(null);
    vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);
    vi.spyOn(userRepository, 'updateLastLogin').mockResolvedValue(appleUser as never);
    verifyIdToken.mockResolvedValue({
      sub: 'apple-user-id',
      email: 'verified@example.com',
      email_verified: true,
    });

    await new AuthService().appleSignIn(
      { identityToken: 'signed-identity-token', email: 'unverified@example.com' },
      { jwt: { sign: vi.fn().mockReturnValue('token') } } as never,
    );

    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      appleUserId: 'apple-user-id',
      email: 'verified@example.com',
      emailVerified: true,
    }));
  });

  it('registers a normalized email with a password hash and returns tokens without credentials', async () => {
    const createdAt = new Date();
    const createUser = vi.spyOn(userRepository, 'createWithPreferences').mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      name: 'Efe',
      avatarUrl: null,
      passwordHash: 'stored-hash',
      tokenVersion: 0,
      role: 'USER',
      appleUserId: null,
      emailVerified: false,
      createdAt,
      updatedAt: createdAt,
      lastLoginAt: null,
    } as never);
    vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);
    const sign = vi.fn().mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');

    const result = await new AuthService().register(
      { name: ' Efe ', email: ' USER@Example.com ', password: 'StrongPassword123!' },
      { jwt: { sign } } as never,
    );

    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'user@example.com',
      name: 'Efe',
      passwordHash: expect.not.stringMatching(/^StrongPassword123!$/),
    }));
    expect(result).toEqual({
      user: {
        id: 'user-id',
        name: 'Efe',
        email: 'user@example.com',
        avatarUrl: null,
        createdAt,
      },
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(sign).toHaveBeenCalledTimes(2);
    expect(sign).toHaveBeenNthCalledWith(1, expect.objectContaining({
      sub: 'user-id',
      email: 'user@example.com',
      tokenVersion: 0,
    }), { expiresIn: config.JWT_EXPIRES_IN });
    expect(sign).toHaveBeenNthCalledWith(2, {
      sub: 'user-id',
      type: 'refresh',
      tokenVersion: 0,
    }, {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN,
      key: config.JWT_REFRESH_SECRET,
    });
  });

  it('rejects duplicate email registration with a conflict', async () => {
    vi.spyOn(userRepository, 'findByEmail').mockResolvedValue({ id: 'existing-user' } as never);
    const createUser = vi.spyOn(userRepository, 'createWithPreferences');

    await expect(new AuthService().register(
      { name: 'Efe', email: 'user@example.com', password: 'StrongPassword123!' },
      { jwt: { sign: vi.fn() } } as never,
    )).rejects.toBeInstanceOf(ConflictError);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('invalidates existing token versions on logout', async () => {
    const increment = vi.spyOn(userRepository, 'incrementTokenVersion').mockResolvedValue(1);
    const result = await new AuthService().logout('user-id', 3);

    expect(increment).toHaveBeenCalledWith('user-id', 3);
    expect(result).toEqual({ message: 'Logged out successfully' });
  });

  it('returns the same unauthorized error for an unknown email and a bad password', async () => {
    vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);

    await expect(new AuthService().login(
      { email: 'unknown@example.com', password: 'wrong-password' },
      { jwt: { sign: vi.fn() } } as never,
    )).rejects.toMatchObject({ statusCode: 401, message: 'Invalid email or password' });
  });
});
