import { z } from 'zod';
import { successResponseSchema, paginationResponseSchema } from './common';
import { sharingScopeEnum, healthDataTypeEnum } from './user.dto';

// ============================================
// PAIRING DTOs - .NET: PairingController DTOs
// ============================================

// Enums
export const pairingStatusEnum = z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'BLOCKED', 'EXPIRED']);
export const respondActionEnum = z.enum(['ACCEPT', 'REJECT']);

// Requests
export const createPairingRequestSchema = z.object({
  inviteeEmail: z.string().email(),
  sharingScope: sharingScopeEnum.default('ACTIVITY_ONLY'),
  customTypes: z.array(healthDataTypeEnum).optional(),
});

export const respondPairingRequestSchema = z.object({
  action: respondActionEnum,
});

export const updatePairingRequestSchema = z.object({
  sharingScope: sharingScopeEnum.optional(),
  customTypes: z.array(healthDataTypeEnum).optional(),
});

// Response Objects
export const pairingUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  email: z.string(),
});

export const pairingResponseSchema = z.object({
  id: z.string(),
  user1Id: z.string(),
  user2Id: z.string(),
  status: pairingStatusEnum,
  sharingScope: sharingScopeEnum,
  customTypes: z.array(healthDataTypeEnum),
  invitedAt: z.date(),
  acceptedAt: z.date().nullable(),
  rejectedAt: z.date().nullable(),
  expiresAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user1: pairingUserSchema,
  user2: pairingUserSchema,
  partner: pairingUserSchema,
  isInviter: z.boolean(),
});

// Responses
export const createPairingResponseSchema = successResponseSchema(z.object({ pairing: pairingResponseSchema }));
export const listPairingsResponseSchema = successResponseSchema(z.object({
  pairings: z.array(pairingResponseSchema)
}));
export const getPairingResponseSchema = successResponseSchema(z.object({ pairing: pairingResponseSchema }));
export const respondPairingResponseSchema = successResponseSchema(z.object({ pairing: pairingResponseSchema }));
export const updatePairingResponseSchema = successResponseSchema(z.object({ pairing: pairingResponseSchema }));
export const deletePairingResponseSchema = successResponseSchema(z.object({ message: z.string() }));

// Types
export type CreatePairingRequest = z.infer<typeof createPairingRequestSchema>;
export type RespondPairingRequest = z.infer<typeof respondPairingRequestSchema>;
export type UpdatePairingRequest = z.infer<typeof updatePairingRequestSchema>;

export type PairingResponse = z.infer<typeof pairingResponseSchema>;