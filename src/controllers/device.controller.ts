import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BaseController, getUserId } from './base.controller';
import { deviceService } from '../services';
import { RegisterDeviceRequest, UpdateDeviceRequest } from '../dtos';

// ============================================
// DEVICE CONTROLLER - .NET: DeviceController
// ============================================
// Presentation layer: HTTP handling for device registration

export class DeviceController extends BaseController {
  // POST /devices - Register Device
  // .NET: [HttpPost] public async Task<IActionResult> Register(RegisterDeviceRequest request)
  async register(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const body = request.body as RegisterDeviceRequest;
    const result = await deviceService.register(userId, body);
    return this.created(reply, { device: result });
  }

  // GET /devices - Get My Devices
  // .NET: [HttpGet] public async Task<IActionResult> GetMyDevices()
  async getMyDevices(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const result = await deviceService.getMyDevices(userId);
    return this.ok(reply, { devices: result });
  }

  // GET /devices/:deviceId - Get Device
  // .NET: [HttpGet("{deviceId}")] public async Task<IActionResult> GetDevice(string deviceId)
  async getDevice(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const { deviceId } = request.params as { deviceId: string };
    const result = await deviceService.getDevice(userId, deviceId);
    return this.ok(reply, { device: result });
  }

  // PATCH /devices/:deviceId - Update Device
  // .NET: [HttpPatch("{deviceId}")] public async Task<IActionResult> UpdateDevice(string deviceId, UpdateDeviceRequest request)
  async updateDevice(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const { deviceId } = request.params as { deviceId: string };
    const body = request.body as UpdateDeviceRequest;
    const result = await deviceService.updateDevice(userId, deviceId, body);
    return this.ok(reply, { device: result });
  }

  // DELETE /devices/:deviceId - Delete Device
  // .NET: [HttpDelete("{deviceId}")] public async Task<IActionResult> DeleteDevice(string deviceId)
  async deleteDevice(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const { deviceId } = request.params as { deviceId: string };
    const result = await deviceService.deleteDevice(userId, deviceId);
    return this.ok(reply, result);
  }
}

// Register routes
export function registerDeviceRoutes(app: FastifyInstance) {
  const controller = new DeviceController();

  app.post('/devices', {
    schema: {
      body: {
        type: 'object',
        required: ['deviceId'],
        properties: {
          deviceId: { type: 'string', minLength: 1 },
          platform: { type: 'string', enum: ['IOS', 'WATCHOS', 'ANDROID', 'WEB'], default: 'IOS' },
          model: { type: 'string' },
          osVersion: { type: 'string' },
          appVersion: { type: 'string' },
          pushToken: { type: 'string' },
        },
      },
    },
  }, controller.register.bind(controller));

  app.get('/devices', controller.getMyDevices.bind(controller));
  app.get('/devices/:deviceId', {
    schema: {
      params: { type: 'object', required: ['deviceId'], properties: { deviceId: { type: 'string' } } },
    },
  }, controller.getDevice.bind(controller));

  app.patch('/devices/:deviceId', {
    schema: {
      params: { type: 'object', required: ['deviceId'], properties: { deviceId: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          model: { type: 'string' },
          osVersion: { type: 'string' },
          appVersion: { type: 'string' },
          pushToken: { type: 'string' },
          isActive: { type: 'boolean' },
        },
      },
    },
  }, controller.updateDevice.bind(controller));

  app.delete('/devices/:deviceId', {
    schema: {
      params: { type: 'object', required: ['deviceId'], properties: { deviceId: { type: 'string' } } },
    },
  }, controller.deleteDevice.bind(controller));
}