import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodFastifyInstance } from '../types/fastify';
import { BaseController, getUserId } from './base.controller';
import { deviceService } from '../services';
import {
  RegisterDeviceRequest,
  UpdateDeviceRequest,
  deviceIdParamsSchema,
  deleteDeviceResponseSchema,
  deviceListResponseSchema,
  deviceSingleResponseSchema,
  registerDeviceResponseSchema,
  registerDeviceRequestSchema,
  updateDeviceRequestSchema,
} from '../dtos';

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
export function registerDeviceRoutes(app: ZodFastifyInstance) {
  const controller = new DeviceController();

  app.post('/devices', {
    schema: {
      tags: ['Devices'],
      body: registerDeviceRequestSchema,
      response: { 201: registerDeviceResponseSchema },
    },
  }, controller.register.bind(controller));

  app.get('/devices', {
    schema: {
      tags: ['Devices'],
      response: { 200: deviceListResponseSchema },
    },
  }, controller.getMyDevices.bind(controller));
  app.get('/devices/:deviceId', {
    schema: {
      params: deviceIdParamsSchema,
      response: { 200: deviceSingleResponseSchema },
    },
  }, controller.getDevice.bind(controller));

  app.patch('/devices/:deviceId', {
    schema: {
      params: deviceIdParamsSchema,
      body: updateDeviceRequestSchema,
      response: { 200: deviceSingleResponseSchema },
    },
  }, controller.updateDevice.bind(controller));

  app.delete('/devices/:deviceId', {
    schema: {
      params: deviceIdParamsSchema,
      response: { 200: deleteDeviceResponseSchema },
    },
  }, controller.deleteDevice.bind(controller));
}