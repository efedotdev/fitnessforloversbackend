import { z } from 'zod';
import { successResponseSchema, paginationQuerySchema, paginationResponseSchema } from './common';

// ============================================
// NOTIFICATION DTOs - .NET: NotificationController DTOs
// ============================================

// Requests
export const queryNotificationsSchema = paginationQuerySchema.extend({
  unreadOnly: z.coerce.boolean().optional(),
});

// Responses
export const notificationResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  body: z.string(),
  data: z.any().nullable(),
  read: z.boolean(),
  sentAt: z.date().nullable(),
  createdAt: z.date(),
});

export const notificationListResponseSchema = successResponseSchema(z.object({
  notifications: z.array(notificationResponseSchema),
  pagination: paginationResponseSchema,
}));

export const unreadCountResponseSchema = successResponseSchema(z.object({ count: z.number() }));
export const markReadResponseSchema = successResponseSchema(z.object({ notification: notificationResponseSchema }));
export const markAllReadResponseSchema = successResponseSchema(z.object({ count: z.number() }));

// Types
export type QueryNotifications = z.infer<typeof queryNotificationsSchema>;
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;