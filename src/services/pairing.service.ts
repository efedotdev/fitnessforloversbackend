import { pairingRepository, userRepository } from '../repositories';
import {
  CreatePairingRequest,
  RespondPairingRequest,
  UpdatePairingRequest,
  PairingResponse,
} from '../dtos';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  SelfPairingError,
  PairingAlreadyExistsError,
  PairingPendingError,
  PairingExpiredError,
  PairingBlockedError,
  PairingNotFoundError,
} from '../exceptions';
import { logger } from '../config/logger';
import { PairingStatus, SharingScope, HealthDataType } from '@prisma/client';

// ============================================
// PAIRING SERVICE - .NET: IPairingService / PairingService
// ============================================
// Business logic for partner pairing: invitations, acceptance, settings

export interface IPairingService {
  createInvitation(userId: string, data: CreatePairingRequest): Promise<PairingResponse>;
  getMyPairings(userId: string): Promise<PairingResponse[]>;
  getPendingReceived(userId: string): Promise<PairingResponse[]>;
  getPendingSent(userId: string): Promise<PairingResponse[]>;
  getPairingById(userId: string, pairingId: string): Promise<PairingResponse>;
  respondToInvitation(userId: string, pairingId: string, data: RespondPairingRequest): Promise<PairingResponse>;
  updatePairing(userId: string, pairingId: string, data: UpdatePairingRequest): Promise<PairingResponse>;
  removePairing(userId: string, pairingId: string): Promise<{ message: string }>;
}

export class PairingService implements IPairingService {
  // Create Pairing Invitation - .NET: async Task<PairingResponse> CreateInvitationAsync(string userId, CreatePairingRequest data)
  async createInvitation(userId: string, data: CreatePairingRequest): Promise<PairingResponse> {
    const { inviteeEmail, sharingScope, customTypes } = data;

    // Find invitee
    const invitee = await userRepository.findByEmail(inviteeEmail);
    if (!invitee) {
      throw new NotFoundError('User');
    }

    if (invitee.id === userId) {
      throw new SelfPairingError();
    }

    // Check existing pairing
    const existing = await pairingRepository.findBetweenUsers(userId, invitee.id);
    if (existing) {
      if (existing.status === 'ACCEPTED') {
        throw new PairingAlreadyExistsError();
      }
      if (existing.status === 'PENDING') {
        throw new PairingPendingError();
      }
      if (existing.status === 'BLOCKED') {
        throw new PairingBlockedError();
      }
    }

    // Create pairing invitation
    const pairing = await pairingRepository.createWithUsers({
      user1: { connect: { id: userId } },
      user2: { connect: { id: invitee.id } },
      pairKey: [userId, invitee.id].sort().join(':'),
      sharingScope,
      customTypes: customTypes || [],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    logger.info({ pairingId: pairing.id, user1Id: userId, user2Id: invitee.id }, 'Pairing invitation created');

    return this.transformPairing(pairing, userId);
  }

  // Get My Pairings - .NET: async Task<PairingResponse[]> GetMyPairingsAsync(string userId)
  async getMyPairings(userId: string): Promise<PairingResponse[]> {
    const pairings = await pairingRepository.findAcceptedByUser(userId);
    return pairings.map((p: any) => this.transformPairing(p, userId));
  }

  // Get Pending Received - .NET: async Task<PairingResponse[]> GetPendingReceivedAsync(string userId)
  async getPendingReceived(userId: string): Promise<PairingResponse[]> {
    const pairings = await pairingRepository.findPendingReceived(userId);
    return pairings.map((p: any) => this.transformPairing(p, userId));
  }

  // Get Pending Sent - .NET: async Task<PairingResponse[]> GetPendingSentAsync(string userId)
  async getPendingSent(userId: string): Promise<PairingResponse[]> {
    const pairings = await pairingRepository.findPendingSent(userId);
    return pairings.map((p: any) => this.transformPairing(p, userId));
  }

  // Get Pairing by ID - .NET: async Task<PairingResponse> GetPairingByIdAsync(string userId, string pairingId)
  async getPairingById(userId: string, pairingId: string): Promise<PairingResponse> {
    const pairing = await pairingRepository.findByIdWithUsers(pairingId);

    if (!pairing || (pairing.user1Id !== userId && pairing.user2Id !== userId)) {
      throw new PairingNotFoundError();
    }

    return this.transformPairing(pairing, userId);
  }

  // Respond to Invitation - .NET: async Task<PairingResponse> RespondToInvitationAsync(string userId, string pairingId, RespondPairingRequest data)
  async respondToInvitation(userId: string, pairingId: string, data: RespondPairingRequest): Promise<PairingResponse> {
    const pairing = await pairingRepository.findByIdWithUsers(pairingId);

    if (!pairing || pairing.user2Id !== userId || pairing.status !== 'PENDING') {
      throw new PairingNotFoundError();
    }

    if (pairing.expiresAt < new Date()) {
      await pairingRepository.updateStatus(pairingId, 'EXPIRED');
      throw new PairingExpiredError();
    }

    const newStatus = data.action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
    const extraData = data.action === 'ACCEPT'
      ? { acceptedAt: new Date() }
      : { rejectedAt: new Date() };

    const updatedPairing = await pairingRepository.updateStatus(pairingId, newStatus, extraData);

    logger.info({ pairingId, action: data.action, userId }, 'Pairing invitation responded');

    return this.transformPairing(updatedPairing, userId);
  }

  // Update Pairing Settings - .NET: async Task<PairingResponse> UpdatePairingAsync(string userId, string pairingId, UpdatePairingRequest data)
  async updatePairing(userId: string, pairingId: string, data: UpdatePairingRequest): Promise<PairingResponse> {
    const pairing = await pairingRepository.findByIdWithUsers(pairingId);

    if (!pairing || (pairing.user1Id !== userId && pairing.user2Id !== userId) || pairing.status !== 'ACCEPTED') {
      throw new PairingNotFoundError();
    }

    const updatedPairing = await pairingRepository.updateSharingScope(
      pairingId,
      data.sharingScope ?? pairing.sharingScope,
      data.customTypes ?? pairing.customTypes
    );

    logger.info({ pairingId, userId, changes: data }, 'Pairing updated');

    return this.transformPairing(updatedPairing, userId);
  }

  // Remove/Block Pairing - .NET: async Task<DeleteResponse> RemovePairingAsync(string userId, string pairingId)
  async removePairing(userId: string, pairingId: string): Promise<{ message: string }> {
    const pairing = await pairingRepository.findByIdWithUsers(pairingId);

    if (!pairing || (pairing.user1Id !== userId && pairing.user2Id !== userId)) {
      throw new PairingNotFoundError();
    }

    if (pairing.status === 'ACCEPTED') {
      await pairingRepository.updateStatus(pairingId, 'BLOCKED');
    } else {
      await pairingRepository.delete(pairingId);
    }

    logger.info({ pairingId, userId, previousStatus: pairing.status }, 'Pairing removed/blocked');

    return { message: 'Pairing removed successfully' };
  }

  // Private helper to transform pairing to response
  private transformPairing(pairing: any, currentUserId: string): PairingResponse {
    const isInviter = pairing.user1Id === currentUserId;
    const partner = isInviter ? pairing.user2 : pairing.user1;

    return {
      id: pairing.id,
      user1Id: pairing.user1Id,
      user2Id: pairing.user2Id,
      status: pairing.status,
      sharingScope: pairing.sharingScope,
      customTypes: pairing.customTypes,
      invitedAt: pairing.invitedAt,
      acceptedAt: pairing.acceptedAt,
      rejectedAt: pairing.rejectedAt,
      expiresAt: pairing.expiresAt,
      createdAt: pairing.createdAt,
      updatedAt: pairing.updatedAt,
      user1: pairing.user1,
      user2: pairing.user2,
      partner: {
        id: partner.id,
        name: partner.name,
        avatarUrl: partner.avatarUrl,
        email: partner.email,
      },
      isInviter,
    };
  }

  // Helper: Get allowed health data types based on sharing scope
  static getAllowedTypes(scope: SharingScope, customTypes: HealthDataType[]): HealthDataType[] {
    const scopeMap: Record<SharingScope, HealthDataType[]> = {
      ALL: [
        'STEPS', 'HEART_RATE', 'ACTIVE_ENERGY', 'BASAL_ENERGY', 'DISTANCE_WALKING_RUNNING',
        'FLIGHTS_CLIMBED', 'EXERCISE_MINUTES', 'STAND_HOURS', 'SLEEP_ANALYSIS', 'WORKOUT',
        'BODY_MASS', 'BODY_FAT_PERCENTAGE', 'HEART_RATE_VARIABILITY', 'RESTING_HEART_RATE',
        'VO2_MAX', 'BLOOD_PRESSURE_SYSTOLIC', 'BLOOD_PRESSURE_DIASTOLIC', 'BLOOD_GLUCOSE',
        'OXYGEN_SATURATION', 'RESPIRATORY_RATE', 'BODY_TEMPERATURE', 'MENSTRUAL_FLOW', 'CUSTOM'
      ],
      ACTIVITY_ONLY: ['STEPS', 'ACTIVE_ENERGY', 'DISTANCE_WALKING_RUNNING', 'FLIGHTS_CLIMBED', 'EXERCISE_MINUTES', 'STAND_HOURS'],
      HEART_ONLY: ['HEART_RATE', 'HEART_RATE_VARIABILITY', 'RESTING_HEART_RATE', 'VO2_MAX'],
      SLEEP_ONLY: ['SLEEP_ANALYSIS'],
      WORKOUT_ONLY: ['WORKOUT', 'ACTIVE_ENERGY', 'HEART_RATE'],
      CUSTOM: customTypes,
    };

    return scopeMap[scope] || [];
  }
}

export const pairingService = new PairingService();