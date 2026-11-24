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
  let config: typeof import('../src/config').config;
  let userRepository: typeof import('../src/repositories').userRepository;
  let userPreferencesRepository: typeof import('../src/repositories').userPreferencesRepository;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/fitnessforlovers';
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-123456';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-123';
    process.env.APPLE_BUNDLE_ID = 'com.example.fitnessforlovers';

    ({ AuthService } = await import('../src/services/auth.service'));
    ({ BadRequestError } = await import('../src/exceptions'));
    ({ config } = await import('../src/config'));
    ({ userRepository, userPreferencesRepository } = await import('../src/repositories'));
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
    const createUser = vi.spyOn(userRepository, 'create').mockResolvedValue(appleUser as never);
    vi.spyOn(userRepository, 'findByAppleId').mockResolvedValue(null);
    vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);
    vi.spyOn(userRepository, 'updateLastLogin').mockResolvedValue(appleUser as never);
    vi.spyOn(userPreferencesRepository, 'upsert').mockResolvedValue({} as never);
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
});
