import { z } from 'zod';
import { successResponseSchema, paginationQuerySchema, paginationResponseSchema } from './common';

// ============================================
// USER DTOs - .NET: UserController DTOs
// ============================================

// Enums (matching Prisma)
export const userRoleEnum = z.enum(['USER', 'ADMIN']);
export const sharingScopeEnum = z.enum([
  'ALL', 'ACTIVITY_ONLY', 'HEART_ONLY', 'SLEEP_ONLY', 'WORKOUT_ONLY', 'CUSTOM'
]);
export const healthDataTypeEnum = z.enum([
  'STEPS', 'HEART_RATE', 'ACTIVE_ENERGY', 'BASAL_ENERGY', 'DISTANCE_WALKING_RUNNING',
  'FLIGHTS_CLIMBED', 'EXERCISE_MINUTES', 'STAND_HOURS', 'SLEEP_ANALYSIS', 'WORKOUT',
  'BODY_MASS', 'BODY_FAT_PERCENTAGE', 'HEART_RATE_VARIABILITY', 'RESTING_HEART_RATE',
  'VO2_MAX', 'BLOOD_PRESSURE_SYSTOLIC', 'BLOOD_PRESSURE_DIASTOLIC', 'BLOOD_GLUCOSE',
  'OXYGEN_SATURATION', 'RESPIRATORY_RATE', 'BODY_TEMPERATURE', 'MENSTRUAL_FLOW', 'CUSTOM'
]);
export const healthDataUnitEnum = z.enum([
  'COUNT', 'BPM', 'KCAL', 'KM', 'METERS', 'MINUTES', 'HOURS',
  'PERCENTAGE', 'KG', 'MMHG', 'MG_DL', 'ML_MIN', 'CELSIUS', 'SECONDS'
]);

// Requests
export const updateProfileRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

export const updatePreferencesRequestSchema = z.object({
  sharingScope: sharingScopeEnum.optional(),
  customDataTypes: z.array(healthDataTypeEnum).optional(),
  notifyOnNewData: z.boolean().optional(),
  notifyOnPartnerActive: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
});

// Responses
export const userPreferencesResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  sharingScope: sharingScopeEnum,
  customDataTypes: z.array(healthDataTypeEnum),
  notifyOnNewData: z.boolean(),
  notifyOnPartnerActive: z.boolean(),
  weeklyDigest: z.boolean(),
  timezone: z.string(),
  language: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const userPublicResponseSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.date(),
});

export const userPrivateResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  appleUserId: z.string().nullable(),
  role: userRoleEnum,
  emailVerified: z.boolean(),
  createdAt: z.date(),
  lastLoginAt: z.date().nullable(),
  preferences: userPreferencesResponseSchema.nullable(),
});

export const profileResponseSchema = successResponseSchema(z.object({ user: userPrivateResponseSchema }));
export const preferencesResponseSchema = successResponseSchema(z.object({ preferences: userPreferencesResponseSchema }));
export const publicUserResponseSchema = successResponseSchema(z.object({ user: userPublicResponseSchema }));
export const deleteAccountResponseSchema = successResponseSchema(z.object({ message: z.string() }));

// Types
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesRequestSchema>;

export type UserPreferencesResponse = z.infer<typeof userPreferencesResponseSchema>;
export type UserPublicResponse = z.infer<typeof userPublicResponseSchema>;
export type UserPrivateResponse = z.infer<typeof userPrivateResponseSchema>;