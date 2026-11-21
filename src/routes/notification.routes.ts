import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { validate } from '../middleware/validation';
import { getUser } from '../middleware/auth';

// ============================================
// SCHEMAS
// ============================================

const queryNotificationsSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  unreadOnly: z.coerce.boolean().default(false),
});

const markAsReadSchema = z.object({
  ids: z.array(z.string()).min(1),
});

// ============================================
// ROUTES
// ============================================

export async function notificationRoutes(app: FastifyInstance) {
  // GET /notifications - List user's notifications
  app.get('/', {
    schema: {
      querystring: queryNotificationsSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { limit, offset, unreadOnly } = request.query as any;

    const where: any = { userId: userPayload.id };
    if (unreadOnly) where.read = false;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: userPayload.id, read: false } }),
    ]);

    return reply.send({
      notifications,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
      unreadCount,
    });
  });

  // GET /notifications/unread-count - Get unread count
  app.get('/unread-count', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);

    const count = await prisma.notification.count({
      where: { userId: userPayload.id, read: false },
    });

    return reply.send({ unreadCount: count });
  });

  // PATCH /notifications/read - Mark notifications as read
  app.patch('/read', {
    schema: {
      body: markAsReadSchema,
    },
    preHandler: validate(markAsReadSchema),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { ids } = request.body as any;

    await prisma.notification.updateMany({
      where: {
        id: { in: ids },
        userId: userPayload.id,
      },
      data: { read: true },
    });

    return reply.send({ message: 'Notifications marked as read' });
  });

  // PATCH /notifications/read-all - Mark all as read
  app.patch('/read-all', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);

    await prisma.notification.updateMany({
      where: { userId: userPayload.id, read: false },
      data: { read: true },
    });

    return reply.send({ message: 'All notifications marked as read' });
  });

  // DELETE /notifications/:id - Delete notification
  app.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { id } = request.params as { id: string };

    const notification = await prisma.notification.findFirst({
      where: { id, userId: userPayload.id },
    });

    if (!notification) {
      return reply.code(404).send({ error: 'Not Found', message: 'Notification not found' });
    }

    await prisma.notification.delete({ where: { id } });

    return reply.send({ message: 'Notification deleted' });
  });
}