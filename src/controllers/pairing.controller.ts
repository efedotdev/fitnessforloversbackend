import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodFastifyInstance } from '../types/fastify';
import { BaseController, getUserId } from './base.controller';
import { pairingService } from '../services';
import {
  CreatePairingRequest,
  RespondPairingRequest,
  UpdatePairingRequest,
  createPairingRequestSchema,
  createPairingResponseSchema,
  listPairingsResponseSchema,
  getPairingResponseSchema,
  respondPairingResponseSchema,
  respondPairingRequestSchema,
  updatePairingRequestSchema,
  updatePairingResponseSchema,
  deletePairingResponseSchema,
} from '../dtos';
import { idParamSchema } from '../dtos/common';

// ============================================
// PAIRING CONTROLLER - .NET: PairingController
// ============================================
// Presentation layer: HTTP handling for partner pairing

export class PairingController extends BaseController {
  // POST /pairings - Create Pairing Invitation
  // .NET: [HttpPost] public async Task<IActionResult> CreateInvitation(CreatePairingRequest request)
  async createInvitation(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const body = request.body as CreatePairingRequest;
    const result = await pairingService.createInvitation(userId, body);
    return this.created(reply, { pairing: result });
  }

  // GET /pairings - Get My Pairings
  // .NET: [HttpGet] public async Task<IActionResult> GetMyPairings()
  async getMyPairings(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const result = await pairingService.getMyPairings(userId);
    return this.ok(reply, { pairings: result });
  }

  // GET /pairings/pending - Get Pending Received
  // .NET: [HttpGet("pending")] public async Task<IActionResult> GetPendingReceived()
  async getPendingReceived(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const result = await pairingService.getPendingReceived(userId);
    return this.ok(reply, { pairings: result });
  }

  // GET /pairings/sent - Get Pending Sent
  // .NET: [HttpGet("sent")] public async Task<IActionResult> GetPendingSent()
  async getPendingSent(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const result = await pairingService.getPendingSent(userId);
    return this.ok(reply, { pairings: result });
  }

  // GET /pairings/:id - Get Pairing by ID
  // .NET: [HttpGet("{id}")] public async Task<IActionResult> GetPairing(string id)
  async getPairing(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const result = await pairingService.getPairingById(userId, id);
    return this.ok(reply, { pairing: result });
  }

  // POST /pairings/:id/respond - Respond to Invitation
  // .NET: [HttpPost("{id}/respond")] public async Task<IActionResult> Respond(string id, RespondPairingRequest request)
  async respondToInvitation(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const body = request.body as RespondPairingRequest;
    const result = await pairingService.respondToInvitation(userId, id, body);
    return this.ok(reply, { pairing: result });
  }

  // PATCH /pairings/:id - Update Pairing
  // .NET: [HttpPatch("{id}")] public async Task<IActionResult> Update(string id, UpdatePairingRequest request)
  async updatePairing(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const body = request.body as UpdatePairingRequest;
    const result = await pairingService.updatePairing(userId, id, body);
    return this.ok(reply, { pairing: result });
  }

  // DELETE /pairings/:id - Remove Pairing
  // .NET: [HttpDelete("{id}")] public async Task<IActionResult> Remove(string id)
  async removePairing(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const result = await pairingService.removePairing(userId, id);
    return this.ok(reply, result);
  }
}

// Register routes
export function registerPairingRoutes(app: ZodFastifyInstance) {
  const controller = new PairingController();

  app.post('/pairings', {
    schema: {
      tags: ['Pairings'],
      summary: 'Send a pairing invitation by email',
      body: createPairingRequestSchema,
      response: { 201: createPairingResponseSchema },
    },
  }, controller.createInvitation.bind(controller));

  app.get('/pairings', {
    schema: {
      tags: ['Pairings'],
      summary: 'List accepted pairings',
      response: { 200: listPairingsResponseSchema },
    },
  }, controller.getMyPairings.bind(controller));
  app.get('/pairings/pending', {
    schema: {
      tags: ['Pairings'],
      summary: 'List received pending invitations',
      response: { 200: listPairingsResponseSchema },
    },
  }, controller.getPendingReceived.bind(controller));
  app.get('/pairings/sent', {
    schema: {
      tags: ['Pairings'],
      summary: 'List sent pending invitations',
      response: { 200: listPairingsResponseSchema },
    },
  }, controller.getPendingSent.bind(controller));
  app.get('/pairings/:id', {
    schema: {
      tags: ['Pairings'],
      summary: 'Get a pairing by ID',
      params: idParamSchema,
      response: { 200: getPairingResponseSchema },
    },
  }, controller.getPairing.bind(controller));

  app.post('/pairings/:id/respond', {
    schema: {
      tags: ['Pairings'],
      summary: 'Accept or reject a received invitation',
      params: idParamSchema,
      body: respondPairingRequestSchema,
      response: { 200: respondPairingResponseSchema },
    },
  }, controller.respondToInvitation.bind(controller));

  app.patch('/pairings/:id', {
    schema: {
      tags: ['Pairings'],
      summary: 'Update sharing scope for an accepted pairing',
      params: idParamSchema,
      body: updatePairingRequestSchema,
      response: { 200: updatePairingResponseSchema },
    },
  }, controller.updatePairing.bind(controller));

  app.delete('/pairings/:id', {
    schema: {
      tags: ['Pairings'],
      summary: 'Unpair or block an accepted partner',
      params: idParamSchema,
      response: { 200: deletePairingResponseSchema },
    },
  }, controller.removePairing.bind(controller));
}