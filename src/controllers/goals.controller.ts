import { FastifyReply, FastifyRequest } from 'fastify';
import { ZodFastifyInstance } from '../types/fastify';
import { z } from 'zod';
import { BaseController, getUserId } from './base.controller';
import { goalService } from '../services';
import {
  createGoalRequestSchema,
  goalListResponseSchema,
  goalProgressResponseSchema,
  goalResponseSchema,
  updateGoalRequestSchema,
} from '../dtos';
import { successResponseSchema } from '../dtos/common';

const idParamsSchema = z.object({ id: z.string().cuid() });
const pairingIdParamsSchema = z.object({ pairingId: z.string().cuid() });

export class GoalsController extends BaseController {
  async create(request: FastifyRequest, reply: FastifyReply) {
    const goal = await goalService.create(getUserId(request), request.body as z.infer<typeof createGoalRequestSchema>);
    return this.created(reply, { goal });
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const goals = await goalService.listForUser(getUserId(request));
    return this.ok(reply, { goals });
  }

  async listForPairing(request: FastifyRequest, reply: FastifyReply) {
    const { pairingId } = request.params as z.infer<typeof pairingIdParamsSchema>;
    const goals = await goalService.listForPairing(getUserId(request), pairingId);
    return this.ok(reply, { goals });
  }

  async get(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as z.infer<typeof idParamsSchema>;
    const goal = await goalService.getById(getUserId(request), id);
    return this.ok(reply, { goal });
  }

  async getProgress(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as z.infer<typeof idParamsSchema>;
    const progress = await goalService.getProgress(getUserId(request), id);
    return this.ok(reply, { progress });
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as z.infer<typeof idParamsSchema>;
    const goal = await goalService.update(
      getUserId(request),
      id,
      request.body as z.infer<typeof updateGoalRequestSchema>
    );
    return this.ok(reply, { goal });
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as z.infer<typeof idParamsSchema>;
    const result = await goalService.delete(getUserId(request), id);
    return this.ok(reply, result);
  }
}

export function registerGoalsRoutes(app: ZodFastifyInstance) {
  const controller = new GoalsController();

  app.post('/goals', {
    schema: {
      tags: ['Goals'],
      summary: 'Create a shared step goal',
      body: createGoalRequestSchema,
      response: { 201: goalResponseSchema },
    },
  }, controller.create.bind(controller));

  app.get('/goals', {
    schema: {
      tags: ['Goals'],
      summary: 'List goals for the authenticated user',
      response: { 200: goalListResponseSchema },
    },
  }, controller.list.bind(controller));

  app.get('/goals/pairing/:pairingId', {
    schema: {
      tags: ['Goals'],
      summary: 'List goals shared by a pairing',
      params: pairingIdParamsSchema,
      response: { 200: goalListResponseSchema },
    },
  }, controller.listForPairing.bind(controller));

  app.get('/goals/:id/progress', {
    schema: {
      tags: ['Goals'],
      summary: 'Get calculated progress for a shared goal',
      params: idParamsSchema,
      response: {
        200: goalProgressResponseSchema,
      },
    },
  }, controller.getProgress.bind(controller));

  app.get('/goals/:id', {
    schema: {
      tags: ['Goals'],
      summary: 'Get a shared goal and its progress',
      params: idParamsSchema,
      response: { 200: goalResponseSchema },
    },
  }, controller.get.bind(controller));

  app.patch('/goals/:id', {
    schema: {
      tags: ['Goals'],
      summary: 'Update a shared goal',
      params: idParamsSchema,
      body: updateGoalRequestSchema,
      response: { 200: goalResponseSchema },
    },
  }, controller.update.bind(controller));

  app.delete('/goals/:id', {
    schema: {
      tags: ['Goals'],
      summary: 'Delete a shared goal',
      params: idParamsSchema,
      response: { 200: successResponseSchema(z.object({ message: z.string() })) },
    },
  }, controller.delete.bind(controller));
}
