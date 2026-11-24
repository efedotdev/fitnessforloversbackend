import { Prisma, SharedGoal } from '@prisma/client';
import { prisma } from '../config/database';

export class GoalRepository {
  create(data: Prisma.SharedGoalCreateInput): Promise<SharedGoal> {
    return prisma.sharedGoal.create({ data });
  }

  findById(id: string): Promise<SharedGoal | null> {
    return prisma.sharedGoal.findUnique({ where: { id } });
  }

  findByPairingIds(pairingIds: string[]): Promise<SharedGoal[]> {
    return prisma.sharedGoal.findMany({
      where: { pairingId: { in: pairingIds } },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  update(id: string, data: Prisma.SharedGoalUpdateInput): Promise<SharedGoal> {
    return prisma.sharedGoal.update({ where: { id }, data });
  }

  delete(id: string): Promise<SharedGoal> {
    return prisma.sharedGoal.delete({ where: { id } });
  }
}

export const goalRepository = new GoalRepository();
