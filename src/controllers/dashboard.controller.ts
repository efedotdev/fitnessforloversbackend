import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BaseController, getUserId } from './base.controller';
import { dashboardService } from '../services';
import { dashboardResponseSchema } from '../dtos';

export class DashboardController extends BaseController {
  async get(request: FastifyRequest, reply: FastifyReply) {
    const result = await dashboardService.getDashboard(getUserId(request));
    return this.ok(reply, result);
  }
}

export function registerDashboardRoutes(app: FastifyInstance) {
  const controller = new DashboardController();
  app.get('/dashboard', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get the authenticated user, partner, goals, and sync dashboard',
      response: { 200: dashboardResponseSchema },
    },
  }, controller.get.bind(controller));
}
