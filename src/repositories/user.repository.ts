import { Prisma, User, UserPreferences, Pairing, Device, Notification, HealthData } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { prisma } from '../config/database';

// ============================================
// USER REPOSITORY - .NET: IUserRepository
// ============================================
// Handles all User-related database operations

export interface IUserRepository extends BaseRepository<
  User,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput,
  Prisma.UserWhereInput
> {
  findByEmail(email: string): Promise<User | null>;
  findByAppleId(appleUserId: string): Promise<User | null>;
  findWithPreferences(id: string): Promise<(User & { preferences: UserPreferences | null }) | null>;
  findWithPairings(id: string): Promise<(User & {
    pairingsAsUser1: Pairing[];
    pairingsAsUser2: Pairing[]
  }) | null>;
  updateLastLogin(id: string): Promise<User>;
  updatePasswordAndIncrementTokenVersion(id: string, passwordHash: string): Promise<User>;
  createWithPreferences(data: Prisma.UserCreateInput): Promise<User>;
  incrementTokenVersion(id: string, expectedVersion: number): Promise<number>;
}

export class UserRepository extends BaseRepository<
  User,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput,
  Prisma.UserWhereInput
> implements IUserRepository {

  protected model = prisma.user;

  async findByEmail(email: string): Promise<User | null> {
    return this.model.findUnique({ where: { email: email.trim().toLowerCase() } });
  }

  async findByAppleId(appleUserId: string): Promise<User | null> {
    return this.model.findUnique({ where: { appleUserId } });
  }

  async findWithPreferences(id: string) {
    return this.model.findUnique({
      where: { id },
      include: { preferences: true },
    });
  }

  async findWithPairings(id: string) {
    return this.model.findUnique({
      where: { id },
      include: {
        pairingsAsUser1: { include: { user2: true } },
        pairingsAsUser2: { include: { user1: true } },
      },
    });
  }

  async updateLastLogin(id: string): Promise<User> {
    return this.model.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async updatePasswordAndIncrementTokenVersion(id: string, passwordHash: string): Promise<User> {
    return this.model.update({
      where: { id },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
    });
  }

  async createWithPreferences(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data });
      await tx.userPreferences.create({ data: { userId: user.id } });
      return user;
    });
  }

  async incrementTokenVersion(id: string, expectedVersion: number): Promise<number> {
    const result = await this.model.updateMany({
      where: { id, tokenVersion: expectedVersion },
      data: { tokenVersion: { increment: 1 } },
    });
    return result.count;
  }
}

// ============================================
// USER PREFERENCES REPOSITORY
// ============================================

export interface IUserPreferencesRepository {
  findByUserId(userId: string): Promise<UserPreferences | null>;
  upsert(userId: string, data: Prisma.UserPreferencesCreateInput): Promise<UserPreferences>;
  update(userId: string, data: Prisma.UserPreferencesUpdateInput): Promise<UserPreferences>;
}

export class UserPreferencesRepository implements IUserPreferencesRepository {
  async findByUserId(userId: string): Promise<UserPreferences | null> {
    return prisma.userPreferences.findUnique({ where: { userId } });
  }

  async upsert(userId: string, data: Prisma.UserPreferencesCreateInput): Promise<UserPreferences> {
    const { userId: _, ...createData } = data as any;
    return prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, ...createData },
      update: data,
    });
  }

  async update(userId: string, data: Prisma.UserPreferencesUpdateInput): Promise<UserPreferences> {
    return prisma.userPreferences.update({ where: { userId }, data });
  }
}

// Export singleton instances - .NET: Dependency Injection via constructor injection
export const userRepository = new UserRepository();
export const userPreferencesRepository = new UserPreferencesRepository();