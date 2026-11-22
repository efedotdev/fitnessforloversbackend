import { z } from 'zod';
import { successResponseSchema, paginationResponseSchema } from './common';

// ============================================
// DEVICE DTOs - .NET: DeviceController DTOs
// ============================================

// Enums
export const devicePlatformEnum = z.enum(['IOS', 'WATCHOS', 'ANDROID', 'WEB']);

// Requests
export const registerDeviceRequestSchema = z.object({
  deviceId: z.string().min(1),
  platform: devicePlatformEnum.default('IOS'),
  model: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
  pushToken: z.string().optional(),
});

export const updateDeviceRequestSchema = z.object({
  model: z.string().optional().nullable(),
  osVersion: z.string().optional().nullable(),
  appVersion: z.string().optional().nullable(),
  pushToken: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

// Responses
export const deviceResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  deviceId: z.string(),
  platform: devicePlatformEnum,
  model: z.string().nullable(),
  osVersion: z.string().nullable(),
  appVersion: z.string().nullable(),
  pushToken: z.string().nullable(),
  isActive: z.boolean(),
  lastSyncAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const deviceListResponseSchema = successResponseSchema(z.object({
  devices: z.array(deviceResponseSchema),
}));

export const deviceSingleResponseSchema = successResponseSchema(z.object({ device: deviceResponseSchema }));
export const registerDeviceResponseSchema = successResponseSchema(z.object({ device: deviceResponseSchema }));
export const deleteDeviceResponseSchema = successResponseSchema(z.object({ message: z.string() }));

// Types
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;
export type UpdateDeviceRequest = z.infer<typeof updateDeviceRequestSchema>;
export type DeviceResponse = z.infer<typeof deviceResponseSchema>;