import { FastifyInstance } from 'fastify';
import appleSignin from 'apple-signin-auth';
import bcrypt from 'bcryptjs';
import { JsonWebTokenError } from 'jsonwebtoken';
import { userRepository } from '../repositories';
import {
  AppleSignInRequest,
  RefreshTokenRequest,
  VerifyAppleRequest,
  RegisterRequest,
  LoginRequest,
  EmailAuthResponse,
  AuthResponse,
  UserResponse,
  TokensResponse,
  appleSignInResponseSchema,
} from '../dtos';
import { z } from 'zod';
import {
  UnauthorizedError,
  BadRequestError,
  ConflictError,
  InternalServerError
} from '../exceptions';
import { config } from '../config';
import { logger } from '../config/logger';

export async function verifyAppleIdentityToken(identityToken: string) {
  const audience = config.APPLE_BUNDLE_ID;
  if (!audience) {
    throw new InternalServerError('Apple Sign In is not configured');
  }

  try {
    return await appleSignin.verifyIdToken(identityToken, { audience });
  } catch (error) {
    if (error instanceof JsonWebTokenError) {
      throw new BadRequestError('Invalid identity token');
    }
    throw error;
  }
}

// ============================================
// AUTH SERVICE - .NET: IAuthService / AuthService
// ============================================
// Business logic for authentication: Apple Sign In, token management

export type AppleSignInResponseData = z.infer<typeof appleSignInResponseSchema> extends { success: true; data: infer T } ? T : never;

export interface IAuthService {
  register(request: RegisterRequest, app: FastifyInstance): Promise<EmailAuthResponse>;
  login(request: LoginRequest, app: FastifyInstance): Promise<EmailAuthResponse>;
  appleSignIn(request: AppleSignInRequest, app: FastifyInstance): Promise<AppleSignInResponseData>;
  refreshToken(request: RefreshTokenRequest, app: FastifyInstance): Promise<TokensResponse>;
  verifyAppleToken(request: VerifyAppleRequest): Promise<{ valid: boolean; appleUserId?: string }>;
  getCurrentUser(userId: string): Promise<UserResponse>;
  logout(userId: string, tokenVersion: number): Promise<{ message: string }>;
}

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-user-password', 10);

export class AuthService implements IAuthService {
  async register(request: RegisterRequest, app: FastifyInstance): Promise<EmailAuthResponse> {
    const email = request.email.trim().toLowerCase();
    if (await userRepository.findByEmail(email)) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(request.password, 12);
    const user = await userRepository.createWithPreferences({
      email,
      passwordHash,
      name: request.name.trim(),
    });
    const tokens = await this.generateTokens(app, user.id, user.email, user.role, user.tokenVersion);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      tokens,
    };
  }

  async login(request: LoginRequest, app: FastifyInstance): Promise<EmailAuthResponse> {
    const user = await userRepository.findByEmail(request.email.trim().toLowerCase());
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await bcrypt.compare(request.password, passwordHash);

    if (!user || !user.passwordHash || !passwordMatches) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const updatedUser = await userRepository.updateLastLogin(user.id);
    const tokens = await this.generateTokens(
      app,
      updatedUser.id,
      updatedUser.email,
      updatedUser.role,
      updatedUser.tokenVersion
    );

    return {
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        avatarUrl: updatedUser.avatarUrl,
        createdAt: updatedUser.createdAt,
      },
      tokens,
    };
  }

  // Apple Sign In - .NET: async Task<AuthResponse> AppleSignInAsync(AppleSignInRequest request)
  async appleSignIn(request: AppleSignInRequest, app: FastifyInstance): Promise<AppleSignInResponseData> {
    const { identityToken, fullName } = request;

    const appleIdentity = await verifyAppleIdentityToken(identityToken);
    const appleUserId = appleIdentity.sub;

    // Find or create user
    let user = await userRepository.findByAppleId(appleUserId);
    let isNewUser = false;

    if (!user) {
      const email = (appleIdentity.email || `${appleUserId}@appleid.privacy`).trim().toLowerCase();

      // Check if email already exists (different Apple ID)
      const existingEmail = await userRepository.findByEmail(email);
      if (existingEmail) {
        throw new ConflictError('Email already registered with another account');
      }

      user = await userRepository.createWithPreferences({
        appleUserId,
        email,
        name: fullName
          ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim() || null
          : null,
        emailVerified: appleIdentity.email_verified === true || appleIdentity.email_verified === 'true',
      });
      isNewUser = true;
    }

    // Update last login
    await userRepository.updateLastLogin(user.id);

    // Generate tokens
    const tokens = await this.generateTokens(app, user.id, user.email, user.role, user.tokenVersion);

    logger.info({ userId: user.id, isNewUser }, 'Apple Sign In successful');

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        appleUserId: user.appleUserId,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        isNewUser,
      },
      tokens,
    };
  }

  // Refresh Access Token - .NET: async Task<TokensResponse> RefreshTokenAsync(RefreshTokenRequest request)
  async refreshToken(request: RefreshTokenRequest, app: FastifyInstance): Promise<TokensResponse> {
    const { refreshToken } = request;

    try {
      const decoded = app.jwt.verify<{ sub: string; type: string; tokenVersion?: number }>(refreshToken, {
        maxAge: config.JWT_REFRESH_EXPIRES_IN,
        key: config.JWT_REFRESH_SECRET,
      });

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
      }

      const user = await userRepository.findById(decoded.sub);
      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      if ((decoded.tokenVersion ?? 0) !== user.tokenVersion) {
        throw new UnauthorizedError('Invalid or expired refresh token');
      }

      return this.generateTokens(app, user.id, user.email, user.role, user.tokenVersion);
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error;
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }

  // Verify Apple Identity Token - .NET: async Task<VerifyResponse> VerifyAppleAsync(VerifyAppleRequest request)
  async verifyAppleToken(request: VerifyAppleRequest): Promise<{ valid: boolean; appleUserId?: string }> {
    const appleIdentity = await verifyAppleIdentityToken(request.identityToken);
    return { valid: true, appleUserId: appleIdentity.sub };
  }

  // Get Current User Profile - .NET: async Task<UserResponse> GetCurrentUserAsync(string userId)
  async getCurrentUser(userId: string): Promise<UserResponse> {
    const user = await userRepository.findWithPreferences(userId);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      appleUserId: user.appleUserId,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      preferences: user.preferences,
    };
  }

  // Logout - .NET: async Task<LogoutResponse> LogoutAsync(string userId)
  async logout(userId: string, tokenVersion: number): Promise<{ message: string }> {
    const updated = await userRepository.incrementTokenVersion(userId, tokenVersion);
    if (updated !== 1) {
      throw new UnauthorizedError('Invalid or expired token');
    }

    logger.info({ userId }, 'User logged out');
    return { message: 'Logged out successfully' };
  }

  // Private helper methods
  private async generateTokens(
    app: FastifyInstance,
    userId: string,
    email: string,
    role: string,
    tokenVersion: number
  ): Promise<TokensResponse> {
    const accessToken = app.jwt.sign(
      { sub: userId, email, role, tokenVersion },
      { expiresIn: config.JWT_EXPIRES_IN }
    );
    const refreshToken = app.jwt.sign(
      { sub: userId, type: 'refresh', tokenVersion },
      { expiresIn: config.JWT_REFRESH_EXPIRES_IN, key: config.JWT_REFRESH_SECRET }
    );
    return { accessToken, refreshToken };
  }

}

// Singleton instance - .NET: services.AddScoped<IAuthService, AuthService>()
export const authService = new AuthService();