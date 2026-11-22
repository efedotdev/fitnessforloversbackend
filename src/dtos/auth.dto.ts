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

// Responses
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

// Types
export type AppleSignInRequest = z.infer<typeof appleSignInRequestSchema>;
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;
export type VerifyAppleRequest = z.infer<typeof verifyAppleRequestSchema>;

export type UserResponse = z.infer<typeof userResponseSchema>;
export type TokensResponse = z.infer<typeof tokensResponseSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;