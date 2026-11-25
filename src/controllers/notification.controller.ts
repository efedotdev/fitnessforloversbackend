import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodFastifyInstance } from '../types/fastify';
import { BaseController, getUserId } from './base.controller';
import { notificationService } from '../services';
import {
  QueryNotifications,
  markAllReadResponseSchema,
  markReadResponseSchema,
  notificationIdParamsSchema,
  notificationListResponseSchema,
  queryNotificationsSchema,
  unreadCountResponseSchema,
} from '../dtos';

// ============================================
// NOTIFICATION CONTROLLER - .NET: NotificationController
// ============================================
// Presentation layer: HTTP handling for in-app notifications

export class NotificationController extends BaseController {
  // GET /notifications - Get My Notifications
  // .NET: [HttpGet] public async Task<IActionResult> GetMyNotifications([FromQuery] QueryNotifications query)
  async getMyNotifications(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const query = request.query as QueryNotifications;
    const result = await notificationService.getMyNotifications(userId, query);
    return this.ok(reply, result);
  }

  // GET /notifications/unread-count - Get Unread Count
  // .NET: [HttpGet("unread-count")] public async Task<IActionResult> GetUnreadCount()
  async getUnreadCount(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const count = await notificationService.getUnreadCount(userId);
    return this.ok(reply, { count });
  }

  // PATCH /notifications/:id/read - Mark As Read
  // .NET: [HttpPatch("{id}/read")] public async Task<IActionResult> MarkAsRead(string id)
  async markAsRead(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const result = await notificationService.markAsRead(userId, id);
    return this.ok(reply, { notification: result });
  }

  // POST /notifications/read-all - Mark All As Read
  // .NET: [HttpPost("read-all")] public async Task<IActionResult> MarkAllAsRead()
  async markAllAsRead(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const count = await notificationService.markAllAsRead(userId);
    return this.ok(reply, { count });
  }
}

// Register routes
export function registerNotificationRoutes(app: ZodFastifyInstance) {
  const controller = new NotificationController();

  app.get('/notifications', {
    schema: {
      tags: ['Notifications'],
      querystring: queryNotificationsSchema,
      response: { 200: notificationListResponseSchema },
    },
  }, controller.getMyNotifications.bind(controller));

  app.get('/notifications/unread-count', {
    schema: {
      tags: ['Notifications'],
      response: { 200: unreadCountResponseSchema },
    },
  }, controller.getUnreadCount.bind(controller));
  app.patch('/notifications/:id/read', {
    schema: {
      tags: ['Notifications'],
      params: notificationIdParamsSchema,
      response: { 200: markReadResponseSchema },
    },
  }, controller.markAsRead.bind(controller));
  app.post('/notifications/read-all', {
    schema: {
      tags: ['Notifications'],
      response: { 200: markAllReadResponseSchema },
    },
  }, controller.markAllAsRead.bind(controller));
}