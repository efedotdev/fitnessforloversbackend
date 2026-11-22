import { FastifyInstance } from 'fastify';
import { userRepository, userPreferencesRepository } from '../repositories';
import {
  AppleSignInRequest,
  RefreshTokenRequest,
  VerifyAppleRequest,
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
import { logger } from '../config/logger';

// ============================================
// AUTH SERVICE - .NET: IAuthService / AuthService
// ============================================
// Business logic for authentication: Apple Sign In, token management

export type AppleSignInResponseData = z.infer<typeof appleSignInResponseSchema> extends { success: true; data: infer T } ? T : never;

export interface IAuthService {
  appleSignIn(request: AppleSignInRequest, app: FastifyInstance): Promise<AppleSignInResponseData>;
  refreshToken(request: RefreshTokenRequest, app: FastifyInstance): Promise<TokensResponse>;
  verifyAppleToken(request: VerifyAppleRequest): Promise<{ valid: boolean; appleUserId?: string }>;
  getCurrentUser(userId: string): Promise<UserResponse>;
  logout(userId: string): Promise<{ message: string }>;
}

export class AuthService implements IAuthService {
  // Apple Sign In - .NET: async Task<AuthResponse> AppleSignInAsync(AppleSignInRequest request)
  async appleSignIn(request: AppleSignInRequest, app: FastifyInstance): Promise<AppleSignInResponseData> {
    const { identityToken, authorizationCode, fullName, email: providedEmail } = request;

    const appleUserId = this.extractAppleUserId(identityToken);
    if (!appleUserId) {
      throw new BadRequestError('Invalid identity token');
    }

    // Find or create user
    let user = await userRepository.findByAppleId(appleUserId);
    let isNewUser = false;

    if (!user) {
      const email = providedEmail || `${appleUserId}@appleid.privacy`;

      // Check if email already exists (different Apple ID)
      const existingEmail = await userRepository.findByEmail(email);
      if (existingEmail) {
        throw new ConflictError('Email already registered with another account');
      }

      user = await userRepository.create({
        appleUserId,
        email,
        name: fullName
          ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim() || null
          : null,
        emailVerified: !!providedEmail,
      });

      // Create default preferences
      await userPreferencesRepository.upsert(user.id, { user: { connect: { id: user.id } } });
      isNewUser = true;
    }

    // Update last login
    await userRepository.updateLastLogin(user.id);

    // Generate tokens
    const tokens = await this.generateTokens(app, user.id, user.email, user.role);

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
      const decoded = app.jwt.verify<{ sub: string; type: string }>(refreshToken);

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
      }

      const user = await userRepository.findById(decoded.sub);
      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      return this.generateTokens(app, user.id, user.email, user.role);
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error;
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }

  // Verify Apple Identity Token - .NET: async Task<VerifyResponse> VerifyAppleAsync(VerifyAppleRequest request)
  async verifyAppleToken(request: VerifyAppleRequest): Promise<{ valid: boolean; appleUserId?: string }> {
    const { identityToken } = request;
    const appleUserId = this.extractAppleUserId(identityToken);

    if (!appleUserId) {
      throw new BadRequestError('Invalid identity token');
    }

    return { valid: true, appleUserId };
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
  async logout(userId: string): Promise<{ message: string }> {
    // In a real app, you might blacklist the refresh token here
    // For now, client-side token deletion is sufficient
    logger.info({ userId }, 'User logged out');
    return { message: 'Logged out successfully' };
  }

  // Private helper methods
  private async generateTokens(
    app: FastifyInstance,
    userId: string,
    email: string,
    role: string
  ): Promise<TokensResponse> {
    const accessToken = app.jwt.sign({ sub: userId, email, role }, { expiresIn: '15m' });
    const refreshToken = app.jwt.sign({ sub: userId, type: 'refresh' }, { expiresIn: '30d' });
    return { accessToken, refreshToken };
  }

  private extractAppleUserId(identityToken: string): string | null {
    try {
      const parts = identityToken.split('.');
      const payloadPart = parts[1];
      if (!payloadPart) return null;
      const payload = JSON.parse(Buffer.from(payloadPart, 'base64').toString());
      return payload.sub || null;
    } catch {
      return null;
    }
  }
}

// Singleton instance - .NET: services.AddScoped<IAuthService, AuthService>()
export const authService = new AuthService();