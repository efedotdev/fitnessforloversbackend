import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BaseController, getUserId } from './base.controller';
import { healthDataService } from '../services';
import {
  CreateHealthDataRequest,
  BulkHealthDataRequest,
  QueryHealthData,
  PartnerHealthDataQuery,
  bulkSyncResponseSchema,
  createHealthDataResponseSchema,
  healthDataListResponseSchema,
  partnerHealthDataResponseSchema,
  summaryResponseSchema,
  partnerSummaryResponseSchema,
  deleteHealthDataResponseSchema,
} from '../dtos';

// ============================================
// HEALTH DATA CONTROLLER - .NET: HealthDataController
// ============================================
// Presentation layer: HTTP handling for health data CRUD and sharing

export class HealthDataController extends BaseController {
  // POST /health-data - Create Single Health Data
  // .NET: [HttpPost] public async Task<IActionResult> Create(CreateHealthDataRequest request)
  async create(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const body = request.body as CreateHealthDataRequest;
    const result = await healthDataService.create(userId, body);
    return this.created(reply, { healthData: result });
  }

  // POST /health-data/bulk - Bulk Create (HealthKit Sync)
  // .NET: [HttpPost("bulk")] public async Task<IActionResult> BulkCreate(BulkHealthDataRequest request)
  async bulkCreate(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const body = request.body as BulkHealthDataRequest;
    const result = await healthDataService.bulkCreate(userId, body);
    return this.ok(reply, result);
  }

  // GET /health-data - Get My Health Data
  // .NET: [HttpGet] public async Task<IActionResult> GetMyData([FromQuery] QueryHealthData query)
  async getMyData(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const query = request.query as QueryHealthData;
    const result = await healthDataService.getMyData(userId, query);
    return this.ok(reply, result);
  }

  // GET /health-data/summary - Get Daily Summary
  // .NET: [HttpGet("summary")] public async Task<IActionResult> GetDailySummary()
  async getDailySummary(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const result = await healthDataService.getDailySummary(userId);
    return this.ok(reply, { summary: result });
  }

  // GET /health-data/partner/:partnerId - Get Partner Health Data
  // .NET: [HttpGet("partner/{partnerId}")] public async Task<IActionResult> GetPartnerData(string partnerId, [FromQuery] PartnerHealthDataQuery query)
  async getPartnerData(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const { partnerId } = request.params as { partnerId: string };
    const query = request.query as PartnerHealthDataQuery;
    const result = await healthDataService.getPartnerData(userId, { ...query, partnerId });
    return this.ok(reply, result);
  }

  // GET /health-data/partner/:partnerId/summary - Get Partner Daily Summary
  // .NET: [HttpGet("partner/{partnerId}/summary")] public async Task<IActionResult> GetPartnerSummary(string partnerId)
  async getPartnerSummary(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const { partnerId } = request.params as { partnerId: string };
    const result = await healthDataService.getPartnerSummary(userId, partnerId);
    return this.ok(reply, result);
  }

  // DELETE /health-data/:id - Delete Health Data
  // .NET: [HttpDelete("{id}")] public async Task<IActionResult> Delete(string id)
  async delete(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const result = await healthDataService.delete(userId, id);
    return this.ok(reply, result);
  }
}

// Register routes
export function registerHealthDataRoutes(app: FastifyInstance) {
  const controller = new HealthDataController();

  app.post('/health-data', {
    schema: {
      tags: ['Health data'],
      summary: 'Create a health data sample',
      body: {
        type: 'object',
        required: ['type', 'unit', 'value', 'startDate', 'endDate'],
        properties: {
          type: { type: 'string', enum: ['STEPS', 'HEART_RATE', 'ACTIVE_ENERGY', 'BASAL_ENERGY', 'DISTANCE_WALKING_RUNNING', 'FLIGHTS_CLIMBED', 'EXERCISE_MINUTES', 'STAND_HOURS', 'SLEEP_ANALYSIS', 'WORKOUT', 'BODY_MASS', 'BODY_FAT_PERCENTAGE', 'HEART_RATE_VARIABILITY', 'RESTING_HEART_RATE', 'VO2_MAX', 'BLOOD_PRESSURE_SYSTOLIC', 'BLOOD_PRESSURE_DIASTOLIC', 'BLOOD_GLUCOSE', 'OXYGEN_SATURATION', 'RESPIRATORY_RATE', 'BODY_TEMPERATURE', 'MENSTRUAL_FLOW', 'CUSTOM'] },
          unit: { type: 'string', enum: ['COUNT', 'BPM', 'KCAL', 'KM', 'METERS', 'MINUTES', 'HOURS', 'PERCENTAGE', 'KG', 'MMHG', 'MG_DL', 'ML_MIN', 'CELSIUS', 'SECONDS'] },
          value: { type: 'number' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          sourceName: { type: 'string' },
          sourceVersion: { type: 'string' },
          deviceId: { type: 'string' },
          sourceSampleId: { type: 'string', minLength: 1, maxLength: 255 },
          metadata: { type: 'object' },
        },
      },
      response: { 201: createHealthDataResponseSchema },
    },
  }, controller.create.bind(controller));

  app.post('/health-data/bulk', {
    schema: {
      tags: ['Health data'],
      summary: 'Idempotently sync HealthKit samples in bulk',
      body: {
        type: 'object',
        required: ['data'],
        properties: {
          data: {
            type: 'array',
            minItems: 1,
            maxItems: 1000,
            items: {
              type: 'object',
              required: ['type', 'unit', 'value', 'startDate', 'endDate'],
              properties: {
                type: { type: 'string', enum: ['STEPS', 'HEART_RATE', 'ACTIVE_ENERGY', 'BASAL_ENERGY', 'DISTANCE_WALKING_RUNNING', 'FLIGHTS_CLIMBED', 'EXERCISE_MINUTES', 'STAND_HOURS', 'SLEEP_ANALYSIS', 'WORKOUT', 'BODY_MASS', 'BODY_FAT_PERCENTAGE', 'HEART_RATE_VARIABILITY', 'RESTING_HEART_RATE', 'VO2_MAX', 'BLOOD_PRESSURE_SYSTOLIC', 'BLOOD_PRESSURE_DIASTOLIC', 'BLOOD_GLUCOSE', 'OXYGEN_SATURATION', 'RESPIRATORY_RATE', 'BODY_TEMPERATURE', 'MENSTRUAL_FLOW', 'CUSTOM'] },
                unit: { type: 'string', enum: ['COUNT', 'BPM', 'KCAL', 'KM', 'METERS', 'MINUTES', 'HOURS', 'PERCENTAGE', 'KG', 'MMHG', 'MG_DL', 'ML_MIN', 'CELSIUS', 'SECONDS'] },
                value: { type: 'number' },
                startDate: { type: 'string', format: 'date-time' },
                endDate: { type: 'string', format: 'date-time' },
                sourceName: { type: 'string' },
                sourceVersion: { type: 'string' },
                deviceId: { type: 'string' },
                sourceSampleId: { type: 'string', minLength: 1, maxLength: 255 },
                metadata: { type: 'object' },
              },
            },
            response: { 200: bulkSyncResponseSchema },
          },
        },
      },
    },
  }, controller.bulkCreate.bind(controller));

  app.get('/health-data', {
    schema: {
      tags: ['Health data'],
      summary: 'List the authenticated user health data',
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['STEPS', 'HEART_RATE', 'ACTIVE_ENERGY', 'BASAL_ENERGY', 'DISTANCE_WALKING_RUNNING', 'FLIGHTS_CLIMBED', 'EXERCISE_MINUTES', 'STAND_HOURS', 'SLEEP_ANALYSIS', 'WORKOUT', 'BODY_MASS', 'BODY_FAT_PERCENTAGE', 'HEART_RATE_VARIABILITY', 'RESTING_HEART_RATE', 'VO2_MAX', 'BLOOD_PRESSURE_SYSTOLIC', 'BLOOD_PRESSURE_DIASTOLIC', 'BLOOD_GLUCOSE', 'OXYGEN_SATURATION', 'RESPIRATORY_RATE', 'BODY_TEMPERATURE', 'MENSTRUAL_FLOW', 'CUSTOM'] },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          aggregate: { type: 'string', enum: ['raw', 'hourly', 'daily', 'weekly'] },
        },
      },
      response: { 200: healthDataListResponseSchema },
    },
  }, controller.getMyData.bind(controller));

  app.get('/health-data/summary', {
    schema: {
      tags: ['Health data'],
      summary: 'Get the authenticated user daily summary',
      response: { 200: summaryResponseSchema },
    },
  }, controller.getDailySummary.bind(controller));

  app.get('/health-data/partner/:partnerId', {
    schema: {
      tags: ['Health data'],
      summary: 'List a partner health data shared under the accepted pairing scope',
      params: { type: 'object', required: ['partnerId'], properties: { partnerId: { type: 'string', format: 'cuid' } } },
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['STEPS', 'HEART_RATE', 'ACTIVE_ENERGY', 'BASAL_ENERGY', 'DISTANCE_WALKING_RUNNING', 'FLIGHTS_CLIMBED', 'EXERCISE_MINUTES', 'STAND_HOURS', 'SLEEP_ANALYSIS', 'WORKOUT', 'BODY_MASS', 'BODY_FAT_PERCENTAGE', 'HEART_RATE_VARIABILITY', 'RESTING_HEART_RATE', 'VO2_MAX', 'BLOOD_PRESSURE_SYSTOLIC', 'BLOOD_PRESSURE_DIASTOLIC', 'BLOOD_GLUCOSE', 'OXYGEN_SATURATION', 'RESPIRATORY_RATE', 'BODY_TEMPERATURE', 'MENSTRUAL_FLOW', 'CUSTOM'] },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          aggregate: { type: 'string', enum: ['raw', 'hourly', 'daily', 'weekly'] },
        },
      },
      response: { 200: partnerHealthDataResponseSchema },
    },
  }, controller.getPartnerData.bind(controller));

  app.get('/health-data/partner/:partnerId/summary', {
    schema: {
      tags: ['Health data'],
      summary: 'Get a partner daily summary shared under the accepted pairing scope',
      params: { type: 'object', required: ['partnerId'], properties: { partnerId: { type: 'string', format: 'cuid' } } },
      response: { 200: partnerSummaryResponseSchema },
    },
  }, controller.getPartnerSummary.bind(controller));

  app.delete('/health-data/:id', {
    schema: {
      tags: ['Health data'],
      summary: 'Delete an owned health data sample',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'cuid' } } },
      response: { 200: deleteHealthDataResponseSchema },
    },
  }, controller.delete.bind(controller));
}