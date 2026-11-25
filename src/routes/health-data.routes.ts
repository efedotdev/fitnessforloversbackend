import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { healthDataRepository } from '../repositories';
import { healthDataService } from '../services';
import { validate } from '../middleware/validation';
import { getUser } from '../middleware/auth';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';

// ============================================
// SCHEMAS
// ============================================

const healthDataTypeEnum = z.enum([
  'STEPS', 'HEART_RATE', 'ACTIVE_ENERGY', 'BASAL_ENERGY', 'DISTANCE_WALKING_RUNNING',
  'FLIGHTS_CLIMBED', 'EXERCISE_MINUTES', 'STAND_HOURS', 'SLEEP_ANALYSIS', 'WORKOUT',
  'BODY_MASS', 'BODY_FAT_PERCENTAGE', 'HEART_RATE_VARIABILITY', 'RESTING_HEART_RATE',
  'VO2_MAX', 'BLOOD_PRESSURE_SYSTOLIC', 'BLOOD_PRESSURE_DIASTOLIC', 'BLOOD_GLUCOSE',
  'OXYGEN_SATURATION', 'RESPIRATORY_RATE', 'BODY_TEMPERATURE', 'MENSTRUAL_FLOW', 'CUSTOM'
]);

const healthDataUnitEnum = z.enum([
  'COUNT', 'BPM', 'KCAL', 'KM', 'METERS', 'MINUTES', 'HOURS',
  'PERCENTAGE', 'KG', 'MMHG', 'MG_DL', 'ML_MIN', 'CELSIUS', 'SECONDS'
]);

const createHealthDataSchema = z.object({
  type: healthDataTypeEnum,
  unit: healthDataUnitEnum,
  value: z.number(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  sourceName: z.string().optional(),
  sourceVersion: z.string().optional(),
  deviceId: z.string().optional(),
  sourceSampleId: z.string().min(1).max(255).optional(),
  metadata: z.record(z.any()).optional(),
});

const bulkHealthDataSchema = z.object({
  data: z.array(createHealthDataSchema).min(1).max(1000),
});

const queryHealthDataSchema = z.object({
  type: healthDataTypeEnum.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
  aggregate: z.enum(['raw', 'hourly', 'daily', 'weekly']).optional(),
});

const partnerHealthDataQuerySchema = z.object({
  partnerId: z.string(),
  type: healthDataTypeEnum.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(500).default(50),
  aggregate: z.enum(['raw', 'hourly', 'daily', 'weekly']).optional(),
});

// ============================================
// HELPERS
// ============================================

function getDateRange(filter: { startDate?: string; endDate?: string }) {
  const start = filter.startDate ? new Date(filter.startDate) : subDays(new Date(), 30);
  const end = filter.endDate ? new Date(filter.endDate) : new Date();
  return { start, end };
}

async function checkPairingAccess(userId: string, partnerId: string) {
  const pairing = await prisma.pairing.findFirst({
    where: {
      OR: [
        { user1Id: userId, user2Id: partnerId },
        { user1Id: partnerId, user2Id: userId },
      ],
      status: 'ACCEPTED',
    },
  });
  return pairing;
}

// ============================================
// ROUTES
// ============================================

export async function healthDataRoutes(app: FastifyInstance) {
  // POST /health-data - Create single health data record
  app.post('/', {
    schema: {
      body: createHealthDataSchema,
    },
    preHandler: validate(createHealthDataSchema),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const data = request.body as any;

    const healthData = await prisma.healthData.create({
      data: {
        userId: userPayload.id,
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      },
    });

    logger.debug({ userId: userPayload.id, type: data.type }, 'Health data created');

    return reply.code(201).send({ healthData });
  });

  // POST /health-data/bulk - Bulk insert (for HealthKit sync)
  app.post('/bulk', {
    schema: {
      body: bulkHealthDataSchema,
    },
    preHandler: validate(bulkHealthDataSchema),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { data } = request.body as any;

    const result = await healthDataService.bulkCreate(userPayload.id, { data });
    return reply.send(result);
  });

  // GET /health-data - Query own health data
  app.get('/', {
    schema: {
      querystring: queryHealthDataSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { type, startDate, endDate, limit, offset, aggregate } = request.query as any;

    const { start, end } = getDateRange({ startDate, endDate });

    const where: any = {
      userId: userPayload.id,
      startDate: { gte: start },
      endDate: { lte: end },
    };

    if (type) where.type = type;

    const [records, total] = await Promise.all([
      prisma.healthData.findMany({
        where,
        orderBy: { startDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.healthData.count({ where }),
    ]);

    let aggregated = records;
    if (aggregate && aggregate !== 'raw') {
      aggregated = await aggregateHealthData(records, aggregate);
    }

    return reply.send({
      data: aggregated,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  });

  // GET /health-data/summary - Get daily summary for dashboard
  app.get('/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const today = new Date();
    const startOfToday = startOfDay(today);
    const endOfToday = endOfDay(today);

    const [steps, activeEnergy, exerciseMinutes, heartRate, workouts] = await Promise.all([
      healthDataRepository.getAggregateStats(userPayload.id, 'STEPS', startOfToday, endOfToday),
      healthDataRepository.getAggregateStats(userPayload.id, 'ACTIVE_ENERGY', startOfToday, endOfToday),
      healthDataRepository.getAggregateStats(userPayload.id, 'EXERCISE_MINUTES', startOfToday, endOfToday),
      prisma.healthData.findMany({
        where: { userId: userPayload.id, type: 'HEART_RATE', startDate: { gte: startOfToday, lte: endOfToday } },
        orderBy: { startDate: 'desc' },
        take: 1,
      }),
      prisma.healthData.findMany({
        where: { userId: userPayload.id, type: 'WORKOUT', startDate: { gte: startOfToday, lte: endOfToday } },
        orderBy: { startDate: 'desc' },
      }),
    ]);

    return reply.send({
      summary: {
        date: format(today, 'yyyy-MM-dd'),
        steps: steps._sum.value ?? 0,
        activeEnergy: activeEnergy._sum.value ?? 0,
        exerciseMinutes: exerciseMinutes._sum.value ?? 0,
        currentHeartRate: heartRate[0]?.value ?? null,
        workouts: workouts.length,
      },
    });
  });

  // GET /health-data/partner/:partnerId - Get partner's health data
  app.get('/partner/:partnerId', {
    schema: {
      params: z.object({ partnerId: z.string() }),
      querystring: partnerHealthDataQuerySchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { partnerId } = request.params as { partnerId: string };
    const { type, startDate, endDate, limit, aggregate } = request.query as any;

    const pairing = await checkPairingAccess(userPayload.id, partnerId);
    if (!pairing) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Not paired with this user' });
    }

    const allowedTypes = getAllowedTypes(pairing.sharingScope, pairing.customTypes);
    if (type && !allowedTypes.includes(type)) {
      return reply.code(403).send({ error: 'Forbidden', message: 'This data type is not shared' });
    }

    const { start, end } = getDateRange({ startDate, endDate });

    const where: any = {
      userId: partnerId,
      startDate: { gte: start },
      endDate: { lte: end },
      type: { in: allowedTypes },
    };

    if (type) where.type = type;

    const [records, total] = await Promise.all([
      prisma.healthData.findMany({
        where,
        orderBy: { startDate: 'desc' },
        take: limit,
      }),
      prisma.healthData.count({ where }),
    ]);

    let aggregated = records;
    if (aggregate && aggregate !== 'raw') {
      aggregated = await aggregateHealthData(records, aggregate);
    }

    return reply.send({
      data: aggregated,
      pagination: { total, limit, hasMore: false },
      partner: {
        id: partnerId,
        sharingScope: pairing.sharingScope,
      },
    });
  });

  // GET /health-data/partner/:partnerId/summary - Get partner's daily summary
  app.get('/partner/:partnerId/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { partnerId } = request.params as { partnerId: string };

    const pairing = await checkPairingAccess(userPayload.id, partnerId);
    if (!pairing) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Not paired with this user' });
    }

    const allowedTypes = getAllowedTypes(pairing.sharingScope, pairing.customTypes);
    const today = new Date();
    const startOfToday = startOfDay(today);
    const endOfToday = endOfDay(today);

    const metrics = await Promise.all(
      allowedTypes.map(async (type) => {
        const result = await healthDataRepository.getAggregateStats(
          partnerId,
          type as any,
          startOfToday,
          endOfToday
        );
        return { type, ...result };
      })
    );

    return reply.send({
      summary: {
        date: format(today, 'yyyy-MM-dd'),
        metrics: metrics.filter((m) => m._sum.value != null),
        sharingScope: pairing.sharingScope,
      },
    });
  });

  // DELETE /health-data/:id - Delete own health data record
  app.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);
    const { id } = request.params as { id: string };

    const healthData = await prisma.healthData.findFirst({
      where: { id, userId: userPayload.id },
    });

    if (!healthData) {
      return reply.code(404).send({ error: 'Not Found', message: 'Health data not found' });
    }

    await prisma.healthData.delete({ where: { id } });

    logger.info({ userId: userPayload.id, healthDataId: id }, 'Health data deleted');

    return reply.send({ message: 'Health data deleted' });
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getAllowedTypes(scope: string, customTypes: string[]): string[] {
  const scopeMap: Record<string, string[]> = {
    ALL: [
      'STEPS', 'HEART_RATE', 'ACTIVE_ENERGY', 'BASAL_ENERGY', 'DISTANCE_WALKING_RUNNING',
      'FLIGHTS_CLIMBED', 'EXERCISE_MINUTES', 'STAND_HOURS', 'SLEEP_ANALYSIS', 'WORKOUT',
      'BODY_MASS', 'BODY_FAT_PERCENTAGE', 'HEART_RATE_VARIABILITY', 'RESTING_HEART_RATE',
      'VO2_MAX', 'BLOOD_PRESSURE_SYSTOLIC', 'BLOOD_PRESSURE_DIASTOLIC', 'BLOOD_GLUCOSE',
      'OXYGEN_SATURATION', 'RESPIRATORY_RATE', 'BODY_TEMPERATURE', 'MENSTRUAL_FLOW', 'CUSTOM'
    ],
    ACTIVITY_ONLY: ['STEPS', 'ACTIVE_ENERGY', 'DISTANCE_WALKING_RUNNING', 'FLIGHTS_CLIMBED', 'EXERCISE_MINUTES', 'STAND_HOURS'],
    HEART_ONLY: ['HEART_RATE', 'HEART_RATE_VARIABILITY', 'RESTING_HEART_RATE', 'VO2_MAX'],
    SLEEP_ONLY: ['SLEEP_ANALYSIS'],
    WORKOUT_ONLY: ['WORKOUT', 'ACTIVE_ENERGY', 'HEART_RATE'],
    CUSTOM: customTypes,
  };

  return scopeMap[scope] || [];
}

async function aggregateHealthData(records: any[], granularity: string) {
  const grouped = new Map<string, any[]>();

  for (const record of records) {
    let key: string;
    const date = new Date(record.startDate);

    switch (granularity) {
      case 'hourly':
        key = format(date, 'yyyy-MM-dd HH:00');
        break;
      case 'daily':
        key = format(date, 'yyyy-MM-dd');
        break;
      case 'weekly':
        key = format(date, 'yyyy-"W"ww');
        break;
      default:
        key = record.startDate;
    }

    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(record);
  }

  const aggregated = [];
  for (const [bucket, items] of grouped) {
    const byType = new Map<string, number[]>();
    for (const item of items) {
      if (!byType.has(item.type)) byType.set(item.type, []);
      byType.get(item.type)!.push(item.value);
    }

    const summary: any = { bucket };
    for (const [type, values] of byType) {
      summary[type] = {
        count: values.length,
        sum: values.reduce((a, b) => a + b, 0),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    }
    aggregated.push(summary);
  }

  return aggregated.sort((a, b) => b.bucket.localeCompare(a.bucket));
}