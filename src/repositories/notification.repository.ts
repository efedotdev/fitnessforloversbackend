import { Prisma, Notification } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { prisma } from '../config/database';

// ============================================
// NOTIFICATION REPOSITORY - .NET: INotificationRepository
// ============================================
// Handles in-app notifications (not push notifications)

export interface INotificationRepository extends BaseRepository<
  Notification,
  Prisma.NotificationCreateInput,
  Prisma.NotificationUpdateInput,
  Prisma.NotificationWhereInput
> {
  findByUserId(userId: string, unreadOnly?: boolean, limit?: number): Promise<Notification[]>;
  countUnread(userId: string): Promise<number>;
  markAsRead(id: string, userId: string): Promise<Notification | null>;
  markAllAsRead(userId: string): Promise<{ count: number }>;
  createBulk(notifications: Prisma.NotificationCreateManyInput[]): Promise<{ count: number }>;
}

export class NotificationRepository extends BaseRepository<
  Notification,
  Prisma.NotificationCreateInput,
  Prisma.NotificationUpdateInput,
  Prisma.NotificationWhereInput
> implements INotificationRepository {

  protected model = prisma.notification;

  async findByUserId(userId: string, unreadOnly = false, limit = 50): Promise<Notification[]> {
    return this.model.findMany({
      where: {
        userId,
        ...(unreadOnly && { read: false }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async countUnread(userId: string): Promise<number> {
    return this.model.count({ where: { userId, read: false } });
  }

  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    const notification = await this.model.findFirst({ where: { id, userId } });
    if (!notification) return null;
    return this.model.update({ where: { id }, data: { read: true } });
  }

  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const result = await this.model.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { count: result.count };
  }

  async createBulk(notifications: Prisma.NotificationCreateManyInput[]): Promise<{ count: number }> {
    const result = await this.model.createMany({ data: notifications });
    return { count: result.count };
  }
}

export const notificationRepository = new NotificationRepository();