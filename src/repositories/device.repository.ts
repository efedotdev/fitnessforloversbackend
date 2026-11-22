import { Prisma, Device, DevicePlatform } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { prisma } from '../config/database';

// ============================================
// DEVICE REPOSITORY - .NET: IDeviceRepository
// ============================================
// Handles device registration (for push notifications, sync tracking)

export interface IDeviceRepository extends BaseRepository<
  Device,
  Prisma.DeviceCreateInput,
  Prisma.DeviceUpdateInput,
  Prisma.DeviceWhereInput
> {
  findByUserId(userId: string): Promise<Device[]>;
  findByUserAndDeviceId(userId: string, deviceId: string): Promise<Device | null>;
  upsertDevice(userId: string, deviceId: string, data: Partial<Prisma.DeviceCreateInput>): Promise<Device>;
  updateSyncTime(id: string): Promise<Device>;
  findActiveByUserId(userId: string): Promise<Device[]>;
  findByPushToken(pushToken: string): Promise<Device | null>;
}

export class DeviceRepository extends BaseRepository<
  Device,
  Prisma.DeviceCreateInput,
  Prisma.DeviceUpdateInput,
  Prisma.DeviceWhereInput
> implements IDeviceRepository {

  protected model = prisma.device;

  async findByUserId(userId: string): Promise<Device[]> {
    return this.model.findMany({
      where: { userId },
      orderBy: { lastSyncAt: 'desc' },
    });
  }

  async findByUserAndDeviceId(userId: string, deviceId: string): Promise<Device | null> {
    return this.model.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
    });
  }

  async upsertDevice(userId: string, deviceId: string, data: Partial<Prisma.DeviceCreateInput>): Promise<Device> {
    return this.model.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { userId, deviceId, ...data } as Prisma.DeviceCreateInput,
      update: data,
    });
  }

  async updateSyncTime(id: string): Promise<Device> {
    return this.model.update({
      where: { id },
      data: { lastSyncAt: new Date() },
    });
  }

  async findActiveByUserId(userId: string): Promise<Device[]> {
    return this.model.findMany({
      where: { userId, isActive: true },
    });
  }

  async findByPushToken(pushToken: string): Promise<Device | null> {
    return this.model.findFirst({ where: { pushToken } });
  }
}

export const deviceRepository = new DeviceRepository();