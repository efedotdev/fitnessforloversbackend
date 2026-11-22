import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BaseController, getUserId } from './base.controller';
import { pairingService } from '../services';
import { CreatePairingRequest, RespondPairingRequest, UpdatePairingRequest } from '../dtos';

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
export function registerPairingRoutes(app: FastifyInstance) {
  const controller = new PairingController();

  app.post('/pairings', {
    schema: {
      body: {
        type: 'object',
        required: ['inviteeEmail'],
        properties: {
          inviteeEmail: { type: 'string', format: 'email' },
          sharingScope: { type: 'string', enum: ['ALL', 'ACTIVITY_ONLY', 'HEART_ONLY', 'SLEEP_ONLY', 'WORKOUT_ONLY', 'CUSTOM'], default: 'ACTIVITY_ONLY' },
          customDataTypes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, controller.createInvitation.bind(controller));

  app.get('/pairings', controller.getMyPairings.bind(controller));
  app.get('/pairings/pending', controller.getPendingReceived.bind(controller));
  app.get('/pairings/sent', controller.getPendingSent.bind(controller));
  app.get('/pairings/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'cuid' } },
      },
    },
  }, controller.getPairing.bind(controller));

  app.post('/pairings/:id/respond', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'cuid' } } },
      body: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['ACCEPT', 'REJECT'] } } },
    },
  }, controller.respondToInvitation.bind(controller));

  app.patch('/pairings/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'cuid' } } },
      body: {
        type: 'object',
        properties: {
          sharingScope: { type: 'string', enum: ['ALL', 'ACTIVITY_ONLY', 'HEART_ONLY', 'SLEEP_ONLY', 'WORKOUT_ONLY', 'CUSTOM'] },
          customDataTypes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, controller.updatePairing.bind(controller));

  app.delete('/pairings/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'cuid' } } },
    },
  }, controller.removePairing.bind(controller));
}