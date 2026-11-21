import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { validate } from '../middleware/validation';
import { getUser } from '../middleware/auth';

// ============================================
// SCHEMAS
// ============================================

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

const updatePreferencesSchema = z.object({
  sharingScope: z.enum(['ALL', 'ACTIVITY_ONLY', 'HEART_ONLY', 'SLEEP_ONLY', 'WORKOUT_ONLY', 'CUSTOM']).optional(),
  customDataTypes: z.array(z.enum([
    'STEPS', 'HEART_RATE', 'ACTIVE_ENERGY', 'BASAL_ENERGY', 'DISTANCE_WALKING_RUNNING',
    'FLIGHTS_CLIMBED', 'EXERCISE_MINUTES', 'STAND_HOURS', 'SLEEP_ANALYSIS', 'WORKOUT',
    'BODY_MASS', 'BODY_FAT_PERCENTAGE', 'HEART_RATE_VARIABILITY', 'RESTING_HEART_RATE',
    'VO2_MAX', 'BLOOD_PRESSURE_SYSTOLIC', 'BLOOD_PRESSURE_DIASTOLIC', 'BLOOD_GLUCOSE',
    'OXYGEN_SATURATION', 'RESPIRATORY_RATE', 'BODY_TEMPERATURE', 'MENSTRUAL_FLOW', 'CUSTOM'
  ])).optional(),
  notifyOnNewData: z.boolean().optional(),
  notifyOnPartnerActive: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
});

// ============================================
// ROUTES
// ============================================

export async function userRoutes(app: FastifyInstance) {
  // GET /users/me - Get current user profile (with preferences)
  app.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);

    const user = await prisma.user.findUnique({
      where: { id: userPayload.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        appleUserId: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        lastLoginAt: true,
        preferences: true,
      },
    });

    if (!user) {
      return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
    }

    return reply.send({ user });
  });

  // PATCH /users/me - Update profile
  app.patch('/me', {
    schema: {
      body: updateProfileSchema,
    },
    preHandler: validate(updateProfileSchema),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);

    const user = await prisma.user.update({
      where: { id: userPayload.id },
      data: request.body as any,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        appleUserId: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    logger.info({ userId: user.id }, 'Profile updated');
    return reply.send({ user });
  });

  // GET /users/me/preferences - Get user preferences
  app.get('/me/preferences', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);

    let preferences = await prisma.userPreferences.findUnique({
      where: { userId: userPayload.id },
    });

    if (!preferences) {
      preferences = await prisma.userPreferences.create({
        data: { userId: userPayload.id },
      });
    }

    return reply.send({ preferences });
  });

  // PATCH /users/me/preferences - Update preferences
  app.patch('/me/preferences', {
    schema: {
      body: updatePreferencesSchema,
    },
    preHandler: validate(updatePreferencesSchema),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);

    const preferences = await prisma.userPreferences.upsert({
      where: { userId: userPayload.id },
      create: { userId: userPayload.id, ...request.body as any },
      update: request.body as any,
    });

    logger.info({ userId: userPayload.id }, 'Preferences updated');
    return reply.send({ preferences });
  });

  // DELETE /users/me - Delete account
  app.delete('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);

    await prisma.user.delete({ where: { id: userPayload.id } });

    logger.info({ userId: userPayload.id }, 'Account deleted');
    return reply.send({ message: 'Account deleted successfully' });
  });

  // GET /users/:id - Get public user profile (for pairing display)
  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    getUser(request); // Just verify auth

    const { id } = request.params as { id: string };

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
    }

    return reply.send({ user });
  });
}