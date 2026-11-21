import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { validate } from '../middleware/validation';
import { getUser } from '../middleware/auth';

// ============================================
// SCHEMAS
// ============================================

const createPairingSchema = z.object({
  inviteeEmail: z.string().email(),
  sharingScope: z.enum(['ALL', 'ACTIVITY_ONLY', 'HEART_ONLY', 'SLEEP_ONLY', 'WORKOUT_ONLY', 'CUSTOM']).default('ACTIVITY_ONLY'),
  customTypes: z.array(z.enum([
    'STEPS', 'HEART_RATE', 'ACTIVE_ENERGY', 'BASAL_ENERGY', 'DISTANCE_WALKING_RUNNING',
    'FLIGHTS_CLIMBED', 'EXERCISE_MINUTES', 'STAND_HOURS', 'SLEEP_ANALYSIS', 'WORKOUT',
    'BODY_MASS', 'BODY_FAT_PERCENTAGE', 'HEART_RATE_VARIABILITY', 'RESTING_HEART_RATE',
    'VO2_MAX', 'BLOOD_PRESSURE_SYSTOLIC', 'BLOOD_PRESSURE_DIASTOLIC', 'BLOOD_GLUCOSE',
    'OXYGEN_SATURATION', 'RESPIRATORY_RATE', 'BODY_TEMPERATURE', 'MENSTRUAL_FLOW', 'CUSTOM'
  ])).optional(),
});

const respondPairingSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
});

const updatePairingSchema = z.object({
  sharingScope: z.enum(['ALL', 'ACTIVITY_ONLY', 'HEART_ONLY', 'SLEEP_ONLY', 'WORKOUT_ONLY', 'CUSTOM']).optional(),
  customTypes: z.array(z.enum([
    'STEPS', 'HEART_RATE', 'ACTIVE_ENERGY', 'BASAL_ENERGY', 'DISTANCE_WALKING_RUNNING',
    'FLIGHTS_CLIMBED', 'EXERCISE_MINUTES', 'STAND_HOURS', 'SLEEP_ANALYSIS', 'WORKOUT',
    'BODY_MASS', 'BODY_FAT_PERCENTAGE', 'HEART_RATE_VARIABILITY', 'RESTING_HEART_RATE',
    'VO2_MAX', 'BLOOD_PRESSURE_SYSTOLIC', 'BLOOD_PRESSURE_DIASTOLIC', 'BLOOD_GLUCOSE',
    'OXYGEN_SATURATION', 'RESPIRATORY_RATE', 'BODY_TEMPERATURE', 'MENSTRUAL_FLOW', 'CUSTOM'
  ])).optional(),
});

// ============================================
// ROUTES
// ============================================

export async function pairingRoutes(app: FastifyInstance) {
  // POST /pairings - Create a new pairing invitation
  app.post('/', {
    schema: {
      body: createPairingSchema,
    },
    preHandler: validate(createPairingSchema),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { inviteeEmail, sharingScope, customTypes } = request.body as any;

    const invitee = await prisma.user.findUnique({
      where: { email: inviteeEmail },
      select: { id: true, email: true, name: true },
    });

    if (!invitee) {
      return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
    }

    if (invitee.id === userPayload.id) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Cannot pair with yourself' });
    }

    const existingPairing = await prisma.pairing.findFirst({
      where: {
        OR: [
          { user1Id: userPayload.id, user2Id: invitee.id },
          { user1Id: invitee.id, user2Id: userPayload.id },
        ],
      },
    });

    if (existingPairing) {
      if (existingPairing.status === 'ACCEPTED') {
        return reply.code(409).send({ error: 'Conflict', message: 'Already paired with this user' });
      }
      if (existingPairing.status === 'PENDING') {
        return reply.code(409).send({ error: 'Conflict', message: 'Pairing invitation already pending' });
      }
      if (existingPairing.status === 'BLOCKED') {
        return reply.code(403).send({ error: 'Forbidden', message: 'Pairing blocked' });
      }
    }

    const pairing = await prisma.pairing.create({
      data: {
        user1Id: userPayload.id,
        user2Id: invitee.id,
        sharingScope,
        customTypes: customTypes || [],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true, email: true } },
        user2: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
    });

    logger.info({ pairingId: pairing.id, user1Id: userPayload.id, user2Id: invitee.id }, 'Pairing invitation created');

    return reply.code(201).send({ pairing });
  });

  // GET /pairings - List current user's pairings
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);

    const pairings = await prisma.pairing.findMany({
      where: {
        OR: [{ user1Id: userPayload.id }, { user2Id: userPayload.id }],
      },
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true, email: true } },
        user2: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const transformed = pairings.map((p) => ({
      ...p,
      partner: p.user1Id === userPayload.id ? p.user2 : p.user1,
      isInviter: p.user1Id === userPayload.id,
    }));

    return reply.send({ pairings: transformed });
  });

  // GET /pairings/pending - Get pending invitations (received)
  app.get('/pending', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);

    const pending = await prisma.pairing.findMany({
      where: {
        user2Id: userPayload.id,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
      orderBy: { invitedAt: 'desc' },
    });

    return reply.send({ pairings: pending });
  });

  // GET /pairings/sent - Get sent invitations
  app.get('/sent', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);

    const sent = await prisma.pairing.findMany({
      where: {
        user1Id: userPayload.id,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: {
        user2: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
      orderBy: { invitedAt: 'desc' },
    });

    return reply.send({ pairings: sent });
  });

  // GET /pairings/:id - Get pairing details
  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { id } = request.params as { id: string };

    const pairing = await prisma.pairing.findFirst({
      where: {
        id,
        OR: [{ user1Id: userPayload.id }, { user2Id: userPayload.id }],
      },
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true, email: true } },
        user2: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
    });

    if (!pairing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Pairing not found' });
    }

    return reply.send({
      pairing: {
        ...pairing,
        partner: pairing.user1Id === userPayload.id ? pairing.user2 : pairing.user1,
        isInviter: pairing.user1Id === userPayload.id,
      },
    });
  });

  // POST /pairings/:id/respond - Accept or reject invitation
  app.post('/:id/respond', {
    schema: {
      body: respondPairingSchema,
    },
    preHandler: validate(respondPairingSchema),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { id } = request.params as { id: string };
    const { action } = request.body as any;

    const pairing = await prisma.pairing.findFirst({
      where: {
        id,
        user2Id: userPayload.id,
        status: 'PENDING',
      },
      include: {
        user1: { select: { id: true, name: true } },
        user2: { select: { id: true, name: true } },
      },
    });

    if (!pairing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Pending invitation not found' });
    }

    if (pairing.expiresAt < new Date()) {
      await prisma.pairing.update({ where: { id }, data: { status: 'EXPIRED' } });
      return reply.code(400).send({ error: 'Bad Request', message: 'Invitation expired' });
    }

    const newStatus = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
    const updatedPairing = await prisma.pairing.update({
      where: { id },
      data: {
        status: newStatus,
        acceptedAt: action === 'ACCEPT' ? new Date() : null,
        rejectedAt: action === 'REJECT' ? new Date() : null,
      },
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true } },
        user2: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    logger.info({ pairingId: id, action, userId: userPayload.id }, 'Pairing invitation responded');

    return reply.send({ pairing: updatedPairing });
  });

  // PATCH /pairings/:id - Update pairing settings
  app.patch('/:id', {
    schema: {
      body: updatePairingSchema,
    },
    preHandler: validate(updatePairingSchema),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { id } = request.params as { id: string };

    const pairing = await prisma.pairing.findFirst({
      where: {
        id,
        OR: [{ user1Id: userPayload.id }, { user2Id: userPayload.id }],
        status: 'ACCEPTED',
      },
    });

    if (!pairing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Active pairing not found' });
    }

    const updatedPairing = await prisma.pairing.update({
      where: { id },
      data: request.body as any,
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true } },
        user2: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    logger.info({ pairingId: id, userId: userPayload.id, changes: request.body }, 'Pairing updated');

    return reply.send({ pairing: updatedPairing });
  });

  // DELETE /pairings/:id - Remove/block pairing
  app.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { id } = request.params as { id: string };

    const pairing = await prisma.pairing.findFirst({
      where: {
        id,
        OR: [{ user1Id: userPayload.id }, { user2Id: userPayload.id }],
      },
    });

    if (!pairing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Pairing not found' });
    }

    if (pairing.status === 'ACCEPTED') {
      await prisma.pairing.update({ where: { id }, data: { status: 'BLOCKED' } });
    } else {
      await prisma.pairing.delete({ where: { id } });
    }

    logger.info({ pairingId: id, userId: userPayload.id, previousStatus: pairing.status }, 'Pairing removed/blocked');

    return reply.send({ message: 'Pairing removed successfully' });
  });
}