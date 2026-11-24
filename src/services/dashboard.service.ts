import { HealthDataType, SharingScope } from '@prisma/client';
import { healthDataRepository, pairingRepository, userRepository } from '../repositories';
import { PairingService } from './pairing.service';
import { goalService } from './goal.service';
import { BadRequestError, NotFoundError } from '../exceptions';

const summaryMetrics = [
  { type: 'STEPS', key: 'steps' },
  { type: 'ACTIVE_ENERGY', key: 'activeEnergy' },
  { type: 'DISTANCE_WALKING_RUNNING', key: 'distance' },
] as const;

function getLocalDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

function getStartOfLocalDate(year: number, month: number, day: number, timeZone: string): Date {
  const target = Date.UTC(year, month - 1, day);
  let candidate = target;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(candidate));
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const representedLocalTime = Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      value('hour'),
      value('minute'),
      value('second')
    );
    const adjustment = target - representedLocalTime;
    candidate += adjustment;
    if (adjustment === 0) break;
  }

  return new Date(candidate);
}

export function getTimeZoneDayRange(date: Date, timeZone: string) {
  let parts: ReturnType<typeof getLocalDateParts>;
  try {
    parts = getLocalDateParts(date, timeZone);
  } catch {
    throw new BadRequestError('Invalid timezone preference');
  }

  const start = getStartOfLocalDate(parts.year, parts.month, parts.day, timeZone);
  const nextDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const end = getStartOfLocalDate(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth() + 1,
    nextDate.getUTCDate(),
    timeZone
  );
  return {
    date: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    start,
    end: new Date(end.getTime() - 1),
  };
}

export class DashboardService {
  async getDashboard(userId: string) {
    const user = await userRepository.findWithPreferences(userId);
    if (!user) throw new NotFoundError('User');

    const now = new Date();
    const range = getTimeZoneDayRange(now, user.preferences?.timezone ?? 'UTC');
    const [steps, activeEnergy, distance, pairings, lastSync, goals] = await Promise.all([
      healthDataRepository.getAggregateStats(userId, 'STEPS', range.start, range.end),
      healthDataRepository.getAggregateStats(userId, 'ACTIVE_ENERGY', range.start, range.end),
      healthDataRepository.getAggregateStats(userId, 'DISTANCE_WALKING_RUNNING', range.start, range.end),
      pairingRepository.findAcceptedByUser(userId),
      healthDataRepository.getLatestSync(userId),
      goalService.listForUser(userId),
    ]);

    let partner = null;
    const pairing = pairings[0] as (typeof pairings)[number] & {
      user1: { id: string; name: string | null; avatarUrl: string | null };
      user2: { id: string; name: string | null; avatarUrl: string | null };
    } | undefined;

    if (pairing) {
      const partnerUser = pairing.user1Id === userId ? pairing.user2 : pairing.user1;
      const allowedTypes = PairingService.getAllowedTypes(
        pairing.sharingScope as SharingScope,
        pairing.customTypes as HealthDataType[]
      );
      const summary: Record<string, string | number> = {
        date: range.date,
        sharingScope: pairing.sharingScope,
      };

      for (const metric of summaryMetrics) {
        if (!allowedTypes.includes(metric.type)) continue;
        const aggregate = await healthDataRepository.getAggregateStats(
          partnerUser.id,
          metric.type,
          range.start,
          range.end
        );
        summary[metric.key] = aggregate._sum.value ?? 0;
      }

      partner = {
        id: partnerUser.id,
        name: partnerUser.name,
        avatarUrl: partnerUser.avatarUrl,
        sharingScope: pairing.sharingScope,
        summary,
      };
    }

    return {
      summary: {
        date: range.date,
        steps: steps._sum.value ?? 0,
        activeEnergy: activeEnergy._sum.value ?? 0,
        distance: distance._sum.value ?? 0,
      },
      partner,
      goals: goals.filter((goal) => goal.startDate <= now && goal.endDate >= now),
      sync: {
        lastSyncedAt: lastSync?.completedAt ?? null,
        status: lastSync?.status ?? null,
      },
    };
  }
}

export const dashboardService = new DashboardService();
