import { userRepository, userPreferencesRepository } from '../repositories';
import {
  UpdateProfileRequest,
  UpdatePreferencesRequest,
  UserPrivateResponse,
  UserPreferencesResponse,
  UserPublicResponse,
} from '../dtos';
import { NotFoundError, InternalServerError, BadRequestError } from '../exceptions';
import { logger } from '../config/logger';

// ============================================
// USER SERVICE - .NET: IUserService / UserService
// ============================================
// Business logic for user profile and preferences management

export interface IUserService {
  getProfile(userId: string): Promise<UserPrivateResponse>;
  updateProfile(userId: string, data: UpdateProfileRequest): Promise<UserPrivateResponse>;
  getPreferences(userId: string): Promise<UserPreferencesResponse>;
  updatePreferences(userId: string, data: UpdatePreferencesRequest): Promise<UserPreferencesResponse>;
  deleteAccount(userId: string): Promise<{ message: string }>;
  getPublicProfile(userId: string): Promise<UserPublicResponse>;
}

export class UserService implements IUserService {
  // Get Current User Profile - .NET: async Task<UserPrivateResponse> GetProfileAsync(string userId)
  async getProfile(userId: string): Promise<UserPrivateResponse> {
    const user = await userRepository.findWithPreferences(userId);

    if (!user) {
      throw new NotFoundError('User');
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

  // Update Profile - .NET: async Task<UserPrivateResponse> UpdateProfileAsync(string userId, UpdateProfileRequest data)
  async updateProfile(userId: string, data: UpdateProfileRequest): Promise<UserPrivateResponse> {
    const user = await userRepository.update(userId, data);

    logger.info({ userId }, 'Profile updated');

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
      preferences: null, // Not fetched here for performance
    };
  }

  // Get Preferences - .NET: async Task<UserPreferencesResponse> GetPreferencesAsync(string userId)
  async getPreferences(userId: string): Promise<UserPreferencesResponse> {
    let preferences = await userPreferencesRepository.findByUserId(userId);

    if (!preferences) {
      preferences = await userPreferencesRepository.upsert(userId, { user: { connect: { id: userId } } });
    }

    return {
      id: preferences.id,
      userId: preferences.userId,
      sharingScope: preferences.sharingScope,
      customDataTypes: preferences.customDataTypes,
      notifyOnNewData: preferences.notifyOnNewData,
      notifyOnPartnerActive: preferences.notifyOnPartnerActive,
      weeklyDigest: preferences.weeklyDigest,
      timezone: preferences.timezone,
      language: preferences.language,
      createdAt: preferences.createdAt,
      updatedAt: preferences.updatedAt,
    };
  }

  // Update Preferences - .NET: async Task<UserPreferencesResponse> UpdatePreferencesAsync(string userId, UpdatePreferencesRequest data)
  async updatePreferences(userId: string, data: UpdatePreferencesRequest): Promise<UserPreferencesResponse> {
    if (data.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: data.timezone });
      } catch {
        throw new BadRequestError('Invalid timezone preference');
      }
    }

    const preferences = await userPreferencesRepository.upsert(userId, {
      user: { connect: { id: userId } },
      ...data
    });

    logger.info({ userId }, 'Preferences updated');

    return {
      id: preferences.id,
      userId: preferences.userId,
      sharingScope: preferences.sharingScope,
      customDataTypes: preferences.customDataTypes,
      notifyOnNewData: preferences.notifyOnNewData,
      notifyOnPartnerActive: preferences.notifyOnPartnerActive,
      weeklyDigest: preferences.weeklyDigest,
      timezone: preferences.timezone,
      language: preferences.language,
      createdAt: preferences.createdAt,
      updatedAt: preferences.updatedAt,
    };
  }

  // Delete Account - .NET: async Task<DeleteResponse> DeleteAccountAsync(string userId)
  async deleteAccount(userId: string): Promise<{ message: string }> {
    await userRepository.delete(userId);

    logger.info({ userId }, 'Account deleted');
    return { message: 'Account deleted successfully' };
  }

  // Get Public Profile (for pairing display) - .NET: async Task<UserPublicResponse> GetPublicProfileAsync(string userId)
  async getPublicProfile(userId: string): Promise<UserPublicResponse> {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    return {
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };
  }
}

export const userService = new UserService();