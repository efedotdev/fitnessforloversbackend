import { Prisma, Pairing, PairingStatus, SharingScope, HealthDataType, User } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { prisma } from '../config/database';

// ============================================
// PAIRING REPOSITORY - .NET: IPairingRepository
// ============================================
// Handles pairing (partner relationship) database operations

export interface IPairingRepository extends BaseRepository<
  Pairing,
  Prisma.PairingCreateInput,
  Prisma.PairingUpdateInput,
  Prisma.PairingWhereInput
> {
  createWithUsers(data: Prisma.PairingCreateInput): Promise<Pairing & {
    user1: Pick<User, 'id' | 'name' | 'avatarUrl' | 'email'>;
    user2: Pick<User, 'id' | 'name' | 'avatarUrl' | 'email'>;
  }>;
  findBetweenUsers(user1Id: string, user2Id: string): Promise<Pairing | null>;
  findAcceptedByUser(userId: string): Promise<Pairing[]>;
  findPendingReceived(userId: string): Promise<Pairing[]>;
  findPendingSent(userId: string): Promise<Pairing[]>;
  findByIdWithUsers(id: string): Promise<Pairing | null>;
  updateStatus(id: string, status: PairingStatus, extraData?: { acceptedAt?: Date; rejectedAt?: Date }): Promise<Pairing>;
  updateSharingScope(id: string, scope: SharingScope, customTypes?: HealthDataType[]): Promise<Pairing>;
}

export class PairingRepository extends BaseRepository<
  Pairing,
  Prisma.PairingCreateInput,
  Prisma.PairingUpdateInput,
  Prisma.PairingWhereInput
> implements IPairingRepository {

  protected model = prisma.pairing;

  async createWithUsers(data: Prisma.PairingCreateInput) {
    return this.model.create({
      data,
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true, email: true } },
        user2: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
    });
  }

  async findBetweenUsers(user1Id: string, user2Id: string): Promise<Pairing | null> {
    return this.model.findFirst({
      where: {
        OR: [
          { user1Id, user2Id },
          { user1Id: user2Id, user2Id: user1Id },
        ],
      },
    });
  }

  async findAcceptedByUser(userId: string): Promise<Pairing[]> {
    return this.model.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
        status: 'ACCEPTED',
      },
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true, email: true } },
        user2: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPendingReceived(userId: string): Promise<Pairing[]> {
    return this.model.findMany({
      where: {
        user2Id: userId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true, email: true } },
        user2: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
      orderBy: { invitedAt: 'desc' },
    });
  }

  async findPendingSent(userId: string): Promise<Pairing[]> {
    return this.model.findMany({
      where: {
        user1Id: userId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true, email: true } },
        user2: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
      orderBy: { invitedAt: 'desc' },
    });
  }

  async findByIdWithUsers(id: string): Promise<Pairing | null> {
    return this.model.findUnique({
      where: { id },
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true, email: true } },
        user2: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
    });
  }

  async updateStatus(
    id: string,
    status: PairingStatus,
    extraData?: { acceptedAt?: Date; rejectedAt?: Date }
  ): Promise<Pairing> {
    return this.model.update({
      where: { id },
      data: {
        status,
        ...extraData,
      },
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true, email: true } },
        user2: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
    });
  }

  async updateSharingScope(
    id: string,
    scope: SharingScope,
    customTypes?: HealthDataType[]
  ): Promise<Pairing> {
    return this.model.update({
      where: { id },
      data: {
        sharingScope: scope,
        customTypes: customTypes ?? [],
      },
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true, email: true } },
        user2: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
    });
  }
}

export const pairingRepository = new PairingRepository();