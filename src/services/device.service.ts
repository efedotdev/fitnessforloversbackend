import { deviceRepository } from '../repositories';
import {
  RegisterDeviceRequest,
  UpdateDeviceRequest,
  DeviceResponse,
} from '../dtos';
import { NotFoundError, BadRequestError } from '../exceptions';
import { logger } from '../config/logger';

// ============================================
// DEVICE SERVICE - .NET: IDeviceService / DeviceService
// ============================================
// Business logic for device registration and management

export interface IDeviceService {
  register(userId: string, data: RegisterDeviceRequest): Promise<DeviceResponse>;
  getMyDevices(userId: string): Promise<DeviceResponse[]>;
  getDevice(userId: string, deviceId: string): Promise<DeviceResponse>;
  updateDevice(userId: string, deviceId: string, data: UpdateDeviceRequest): Promise<DeviceResponse>;
  deleteDevice(userId: string, deviceId: string): Promise<{ message: string }>;
  updateSyncTime(deviceId: string): Promise<DeviceResponse>;
}

export class DeviceService implements IDeviceService {
  // Register Device - .NET: async Task<DeviceResponse> RegisterAsync(string userId, RegisterDeviceRequest data)
  async register(userId: string, data: RegisterDeviceRequest): Promise<DeviceResponse> {
    // Check if device already registered for this user
    const existing = await deviceRepository.findByUserAndDeviceId(userId, data.deviceId);

    let device;
    if (existing) {
      // Update existing device
      device = await deviceRepository.update(existing.id, {
        ...data,
        isActive: true,
        lastSyncAt: new Date(),
      });
    } else {
      // Create new device
      device = await deviceRepository.create({
        user: { connect: { id: userId } },
        ...data,
        isActive: true,
        lastSyncAt: new Date(),
      });
    }

    logger.info({ userId, deviceId: data.deviceId }, 'Device registered/updated');

    return this.toResponse(device);
  }

  // Get My Devices - .NET: async Task<DeviceResponse[]> GetMyDevicesAsync(string userId)
  async getMyDevices(userId: string): Promise<DeviceResponse[]> {
    const devices = await deviceRepository.findByUserId(userId);
    return devices.map(this.toResponse);
  }

  // Get Single Device - .NET: async Task<DeviceResponse> GetDeviceAsync(string userId, string deviceId)
  async getDevice(userId: string, deviceId: string): Promise<DeviceResponse> {
    const device = await deviceRepository.findByUserAndDeviceId(userId, deviceId);
    if (!device) {
      throw new NotFoundError('Device');
    }
    return this.toResponse(device);
  }

  // Update Device - .NET: async Task<DeviceResponse> UpdateDeviceAsync(string userId, string deviceId, UpdateDeviceRequest data)
  async updateDevice(userId: string, deviceId: string, data: UpdateDeviceRequest): Promise<DeviceResponse> {
    const device = await deviceRepository.findByUserAndDeviceId(userId, deviceId);
    if (!device) {
      throw new NotFoundError('Device');
    }

    const updated = await deviceRepository.update(device.id, data);
    return this.toResponse(updated);
  }

  // Delete Device - .NET: async Task<DeleteResponse> DeleteDeviceAsync(string userId, string deviceId)
  async deleteDevice(userId: string, deviceId: string): Promise<{ message: string }> {
    const device = await deviceRepository.findByUserAndDeviceId(userId, deviceId);
    if (!device) {
      throw new NotFoundError('Device');
    }

    await deviceRepository.delete(device.id);
    logger.info({ userId, deviceId }, 'Device deleted');

    return { message: 'Device removed successfully' };
  }

  // Update Sync Time - .NET: async Task<DeviceResponse> UpdateSyncTimeAsync(string deviceId)
  async updateSyncTime(deviceId: string): Promise<DeviceResponse> {
    const device = await deviceRepository.updateSyncTime(deviceId);
    if (!device) {
      throw new NotFoundError('Device');
    }
    return this.toResponse(device);
  }

  // Private helper
  private toResponse(device: any): DeviceResponse {
    return {
      id: device.id,
      userId: device.userId,
      deviceId: device.deviceId,
      platform: device.platform,
      model: device.model,
      osVersion: device.osVersion,
      appVersion: device.appVersion,
      pushToken: device.pushToken,
      isActive: device.isActive,
      lastSyncAt: device.lastSyncAt,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  }
}

export const deviceService = new DeviceService();