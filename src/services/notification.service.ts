import { notificationRepository } from '../repositories';
import {
  QueryNotifications,
  NotificationResponse,
} from '../dtos';
import { NotFoundError } from '../exceptions';
import { logger } from '../config/logger';

// ============================================
// NOTIFICATION SERVICE - .NET: INotificationService / NotificationService
// ============================================
// Business logic for in-app notifications

export interface INotificationService {
  getMyNotifications(userId: string, query: QueryNotifications): Promise<{ notifications: NotificationResponse[]; pagination: any }>;
  getUnreadCount(userId: string): Promise<number>;
  markAsRead(userId: string, notificationId: string): Promise<NotificationResponse>;
  markAllAsRead(userId: string): Promise<number>;
  create(userId: string, title: string, body: string, data?: any): Promise<NotificationResponse>;
  createBulk(notifications: Array<{ userId: string; title: string; body: string; data?: any }>): Promise<number>;
}

export class NotificationService implements INotificationService {
  // Get My Notifications - .NET: async Task<PagedResponse<NotificationResponse>> GetMyNotificationsAsync(string userId, QueryNotifications query)
  async getMyNotifications(userId: string, query: QueryNotifications): Promise<{ notifications: NotificationResponse[]; pagination: any }> {
    const { page = 1, limit = 20, unreadOnly = false } = query;
    const offset = (page - 1) * limit;

    const notifications = await notificationRepository.findByUserId(userId, unreadOnly, limit);
    const total = unreadOnly
      ? await notificationRepository.countUnread(userId)
      : await notificationRepository.count({ userId });

    return {
      notifications: notifications.map(this.toResponse),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
      },
    };
  }

  // Get Unread Count - .NET: async Task<int> GetUnreadCountAsync(string userId)
  async getUnreadCount(userId: string): Promise<number> {
    return notificationRepository.countUnread(userId);
  }

  // Mark As Read - .NET: async Task<NotificationResponse> MarkAsReadAsync(string userId, string notificationId)
  async markAsRead(userId: string, notificationId: string): Promise<NotificationResponse> {
    const notification = await notificationRepository.markAsRead(notificationId, userId);
    if (!notification) {
      throw new NotFoundError('Notification');
    }
    return this.toResponse(notification);
  }

  // Mark All As Read - .NET: async Task<int> MarkAllAsReadAsync(string userId)
  async markAllAsRead(userId: string): Promise<number> {
    const result = await notificationRepository.markAllAsRead(userId);
    return result.count;
  }

  // Create Notification (internal use) - .NET: async Task<NotificationResponse> CreateAsync(string userId, string title, string body, object data)
  async create(userId: string, title: string, body: string, data?: any): Promise<NotificationResponse> {
    const notification = await notificationRepository.create({
      user: { connect: { id: userId } },
      title,
      body,
      data,
    });

    logger.debug({ userId, title }, 'Notification created');
    return this.toResponse(notification);
  }

  // Create Bulk Notifications (for partner activity, etc.) - .NET: async Task<int> CreateBulkAsync(NotificationCreateDto[] notifications)
  async createBulk(notifications: Array<{ userId: string; title: string; body: string; data?: any }>): Promise<number> {
    if (notifications.length === 0) return 0;

    const result = await notificationRepository.createBulk(
      notifications.map(n => ({ ...n, read: false }))
    );

    logger.info({ count: result.count }, 'Bulk notifications created');
    return result.count;
  }

  // Private helper
  private toResponse(notification: any): NotificationResponse {
    return {
      id: notification.id,
      userId: notification.userId,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      read: notification.read,
      sentAt: notification.sentAt,
      createdAt: notification.createdAt,
    };
  }
}

export const notificationService = new NotificationService();