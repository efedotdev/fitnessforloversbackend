import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { validate } from '../middleware/validation';
import { getUser } from '../middleware/auth';

// ============================================
// SCHEMAS
// ============================================

const registerDeviceSchema = z.object({
  deviceId: z.string().min(1),
  platform: z.enum(['IOS', 'WATCHOS', 'ANDROID', 'WEB']).default('IOS'),
  model: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
  pushToken: z.string().optional(),
});

const updateDeviceSchema = z.object({
  pushToken: z.string().optional().nullable(),
  model: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updatePushTokenSchema = z.object({
  pushToken: z.string().min(1),
});

// ============================================
// ROUTES
// ============================================

export async function deviceRoutes(app: FastifyInstance) {
  // POST /devices - Register device
  app.post('/', {
    schema: {
      body: registerDeviceSchema,
    },
    preHandler: validate(registerDeviceSchema),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { deviceId, platform, model, osVersion, appVersion, pushToken } = request.body as any;

    const device = await prisma.device.upsert({
      where: {
        userId_deviceId: { userId: userPayload.id, deviceId },
      },
      create: {
        userId: userPayload.id,
        deviceId,
        platform,
        model,
        osVersion,
        appVersion,
        pushToken,
        isActive: true,
        lastSyncAt: new Date(),
      },
      update: {
        platform,
        model,
        osVersion,
        appVersion,
        pushToken,
        isActive: true,
        lastSyncAt: new Date(),
      },
    });

    logger.info({ userId: userPayload.id, deviceId }, 'Device registered/updated');

    return reply.code(201).send({ device });
  });

  // GET /devices - List user's devices
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);

    const devices = await prisma.device.findMany({
      where: { userId: userPayload.id },
      orderBy: { lastSyncAt: 'desc' },
    });

    return reply.send({ devices });
  });

  // GET /devices/:deviceId - Get device details
  app.get('/:deviceId', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { deviceId } = request.params as { deviceId: string };

    const device = await prisma.device.findUnique({
      where: { userId_deviceId: { userId: userPayload.id, deviceId } },
    });

    if (!device) {
      return reply.code(404).send({ error: 'Not Found', message: 'Device not found' });
    }

    return reply.send({ device });
  });

  // PATCH /devices/:deviceId - Update device
  app.patch('/:deviceId', {
    schema: {
      body: updateDeviceSchema,
    },
    preHandler: validate(updateDeviceSchema),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { deviceId } = request.params as { deviceId: string };

    const device = await prisma.device.findUnique({
      where: { userId_deviceId: { userId: userPayload.id, deviceId } },
    });

    if (!device) {
      return reply.code(404).send({ error: 'Not Found', message: 'Device not found' });
    }

    const updated = await prisma.device.update({
      where: { userId_deviceId: { userId: userPayload.id, deviceId } },
      data: request.body as any,
    });

    logger.info({ userId: userPayload.id, deviceId }, 'Device updated');

    return reply.send({ device: updated });
  });

  // POST /devices/:deviceId/push-token - Update push token
  app.post('/:deviceId/push-token', {
    schema: {
      body: updatePushTokenSchema,
    },
    preHandler: validate(updatePushTokenSchema),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { deviceId } = request.params as { deviceId: string };
    const { pushToken } = request.body as any;

    const device = await prisma.device.findUnique({
      where: { userId_deviceId: { userId: userPayload.id, deviceId } },
    });

    if (!device) {
      return reply.code(404).send({ error: 'Not Found', message: 'Device not found' });
    }

    await prisma.device.update({
      where: { userId_deviceId: { userId: userPayload.id, deviceId } },
      data: { pushToken },
    });

    logger.info({ userId: userPayload.id, deviceId }, 'Push token updated');

    return reply.send({ message: 'Push token updated' });
  });

  // DELETE /devices/:deviceId - Remove device
  app.delete('/:deviceId', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { deviceId } = request.params as { deviceId: string };

    const device = await prisma.device.findUnique({
      where: { userId_deviceId: { userId: userPayload.id, deviceId } },
    });

    if (!device) {
      return reply.code(404).send({ error: 'Not Found', message: 'Device not found' });
    }

    await prisma.device.delete({ where: { userId_deviceId: { userId: userPayload.id, deviceId } } });

    logger.info({ userId: userPayload.id, deviceId }, 'Device removed');

    return reply.send({ message: 'Device removed' });
  });

  // POST /devices/:deviceId/sync - Log sync completion
  app.post('/:deviceId/sync', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { deviceId } = request.params as { deviceId: string };
    const { recordsCount, status, errorMessage } = request.body as {
      recordsCount: number;
      status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
      errorMessage?: string;
    };

    const device = await prisma.device.findUnique({
      where: { userId_deviceId: { userId: userPayload.id, deviceId } },
    });

    if (!device) {
      return reply.code(404).send({ error: 'Not Found', message: 'Device not found' });
    }

    await Promise.all([
      prisma.device.update({
        where: { userId_deviceId: { userId: userPayload.id, deviceId } },
        data: { lastSyncAt: new Date() },
      }),
      prisma.syncLog.create({
        data: {
          userId: userPayload.id,
          deviceId,
          recordsCount,
          status,
          errorMessage,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      }),
    ]);

    return reply.send({ message: 'Sync logged' });
  });
}