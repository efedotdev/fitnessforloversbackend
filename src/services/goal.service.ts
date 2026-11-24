import { SharedGoal } from '@prisma/client';
import { goalRepository, healthDataRepository, pairingRepository } from '../repositories';
import { CreateGoalRequest, UpdateGoalRequest } from '../dtos';
import { BadRequestError, ForbiddenError, NotFoundError } from '../exceptions';
import { PairingService } from './pairing.service';

export interface GoalProgress {
  id: string;
  pairingId: string;
  createdById: string;
  title: string;
  targetValue: number;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
  currentValue: number;
  remainingValue: number;
  progressPercentage: number;
  completed: boolean;
}

export class GoalService {
  async create(userId: string, data: CreateGoalRequest): Promise<GoalProgress> {
    const pairing = await this.getAcceptedPairing(userId, data.pairingId);
    this.validateDateRange(new Date(data.startDate), new Date(data.endDate));

    const goal = await goalRepository.create({
      pairing: { connect: { id: pairing.id } },
      createdBy: { connect: { id: userId } },
      title: data.title,
      targetValue: data.targetValue,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
    });

    return this.toProgress(goal, pairing);
  }

  async listForUser(userId: string): Promise<GoalProgress[]> {
    const pairings = await pairingRepository.findAcceptedByUser(userId);
    const goalPairings = pairings.filter((pairing) =>
      PairingService.getAllowedTypes(pairing.sharingScope, pairing.customTypes).includes('STEPS')
    );
    const goals = await goalRepository.findByPairingIds(goalPairings.map((pairing) => pairing.id));
    return Promise.all(goals.map(async (goal) => {
      const pairing = goalPairings.find((item) => item.id === goal.pairingId);
      if (!pairing) throw new ForbiddenError('Goal is not available');
      return this.toProgress(goal, pairing);
    }));
  }

  async listForPairing(userId: string, pairingId: string): Promise<GoalProgress[]> {
    const pairing = await this.getAcceptedPairing(userId, pairingId);
    const goals = await goalRepository.findByPairingIds([pairingId]);
    return Promise.all(goals.map((goal) => this.toProgress(goal, pairing)));
  }

  async getById(userId: string, id: string): Promise<GoalProgress> {
    const goal = await goalRepository.findById(id);
    if (!goal) throw new NotFoundError('Goal');
    const pairing = await this.getAcceptedPairing(userId, goal.pairingId);
    return this.toProgress(goal, pairing);
  }

  async getProgress(userId: string, id: string) {
    const goal = await this.getById(userId, id);
    return {
      currentValue: goal.currentValue,
      remainingValue: goal.remainingValue,
      progressPercentage: goal.progressPercentage,
      completed: goal.completed,
    };
  }

  async update(userId: string, id: string, data: UpdateGoalRequest): Promise<GoalProgress> {
    const current = await goalRepository.findById(id);
    if (!current) throw new NotFoundError('Goal');
    if (current.createdById !== userId) throw new ForbiddenError('Only the goal creator can update it');
    const pairing = await this.getAcceptedPairing(userId, current.pairingId);

    const startDate = data.startDate ? new Date(data.startDate) : current.startDate;
    const endDate = data.endDate ? new Date(data.endDate) : current.endDate;
    this.validateDateRange(startDate, endDate);

    const updated = await goalRepository.update(id, {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.targetValue !== undefined && { targetValue: data.targetValue }),
      ...(data.startDate !== undefined && { startDate }),
      ...(data.endDate !== undefined && { endDate }),
    });
    return this.toProgress(updated, pairing);
  }

  async delete(userId: string, id: string): Promise<{ message: string }> {
    const goal = await goalRepository.findById(id);
    if (!goal) throw new NotFoundError('Goal');
    if (goal.createdById !== userId) throw new ForbiddenError('Only the goal creator can delete it');
    await this.getAcceptedPairing(userId, goal.pairingId);
    await goalRepository.delete(id);
    return { message: 'Goal deleted successfully' };
  }

  private async getAcceptedPairing(userId: string, pairingId: string) {
    const pairing = await pairingRepository.findByIdWithUsers(pairingId);
    if (
      !pairing ||
      pairing.status !== 'ACCEPTED' ||
      (pairing.user1Id !== userId && pairing.user2Id !== userId) ||
      !PairingService.getAllowedTypes(pairing.sharingScope, pairing.customTypes).includes('STEPS')
    ) {
      throw new ForbiddenError('An accepted pairing that allows steps sharing is required');
    }
    return pairing;
  }

  private validateDateRange(startDate: Date, endDate: Date) {
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate < startDate
    ) {
      throw new BadRequestError('Goal endDate must be on or after startDate');
    }
  }

  private async toProgress(goal: SharedGoal, pairing: {
    user1Id: string;
    user2Id: string;
  }): Promise<GoalProgress> {
    const now = new Date();
    const endDate = goal.endDate < now ? goal.endDate : now;
    const currentValue = now < goal.startDate
      ? 0
      : await healthDataRepository.sumStepsForUsersBetween(
        [pairing.user1Id, pairing.user2Id],
        goal.startDate,
        endDate
      );
    return {
      ...goal,
      currentValue,
      remainingValue: Math.max(0, goal.targetValue - currentValue),
      progressPercentage: Math.min(100, Math.max(0, (currentValue / goal.targetValue) * 100)),
      completed: currentValue >= goal.targetValue,
    };
  }
}

export const goalService = new GoalService();
