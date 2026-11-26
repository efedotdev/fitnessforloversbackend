import { z } from 'zod';
import { successResponseSchema } from './common';

// ============================================
// AUTH DTOs - .NET: AuthController DTOs
// ============================================
// Request/Response schemas for authentication endpoints

// Requests
export const appleSignInRequestSchema = z.object({
  identityToken: z.string().min(1),
  authorizationCode: z.string().optional(),
  fullName: z.object({
    givenName: z.string().optional(),
    familyName: z.string().optional(),
  }).optional(),
  email: z.string().email().optional(),
});

export const refreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const verifyAppleRequestSchema = z.object({
  identityToken: z.string().min(1),
});

export const registerRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

export const devResetPasswordRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  newPassword: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
}).refine((request) => request.newPassword === request.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

// Responses
export const emailAuthUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: z.date(),
});

export const userResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  appleUserId: z.string().nullable(),
  role: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.date(),
  lastLoginAt: z.date().nullable(),
  preferences: z.any().nullable().optional(),
});

export const tokensResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const authResponseSchema = z.object({
  user: userResponseSchema,
  tokens: tokensResponseSchema,
});

export const emailAuthResponseSchema = successResponseSchema(
  z.object({
    user: emailAuthUserSchema,
    tokens: tokensResponseSchema,
  })
);

export const appleSignInResponseSchema = successResponseSchema(
  z.object({
    user: userResponseSchema.extend({ isNewUser: z.boolean() }),
    tokens: tokensResponseSchema,
  })
);

export const refreshResponseSchema = successResponseSchema(tokensResponseSchema);
export const verifyAppleResponseSchema = successResponseSchema(
  z.object({ valid: z.boolean(), appleUserId: z.string().optional() })
);
export const meResponseSchema = successResponseSchema(z.object({ user: userResponseSchema }));
export const logoutResponseSchema = successResponseSchema(z.object({ message: z.string() }));
export const devResetPasswordResponseSchema = successResponseSchema(z.object({ message: z.string() }));

// Types
export type AppleSignInRequest = z.infer<typeof appleSignInRequestSchema>;
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;
export type VerifyAppleRequest = z.infer<typeof verifyAppleRequestSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type DevResetPasswordRequest = z.infer<typeof devResetPasswordRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export type UserResponse = z.infer<typeof userResponseSchema>;
export type TokensResponse = z.infer<typeof tokensResponseSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type EmailAuthResponse = z.infer<typeof emailAuthResponseSchema>['data'];