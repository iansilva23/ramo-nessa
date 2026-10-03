import type { FinanceRepository } from './finance-repository.js';
import { PayoutDomainError } from './payout.js';
import { requestDriverPayout } from './request-payout.js';

export const DRIVER_PAYOUT_TIME_ZONE = 'America/Fortaleza';
export const DRIVER_PAYOUT_SCHEDULE_HOUR = 7;
const DRIVER_PAYOUT_SCHEDULE_DAYS = new Set(['Mon', 'Wed', 'Fri']);

function localParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DRIVER_PAYOUT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    weekday: value('weekday'),
    hour: Number(value('hour')),
  };
}

export function scheduledDriverPayoutCycleDate(
  now: Date = new Date(),
): string | null {
  const parts = localParts(now);
  if (
    !DRIVER_PAYOUT_SCHEDULE_DAYS.has(parts.weekday) ||
    !Number.isInteger(parts.hour) ||
    parts.hour < DRIVER_PAYOUT_SCHEDULE_HOUR
  ) {
    return null;
  }
  return parts.date;
}

export async function createScheduledDriverPayouts(input: {
  finance: FinanceRepository;
  now?: Date;
  limit?: number;
}) {
  const now = input.now ?? new Date();
  const cycleDate = scheduledDriverPayoutCycleDate(now);
  const settings = await input.finance.getDriverPayoutSettings();
  if (!settings.automaticEnabled || cycleDate == null) {
    return {
      cycleDate,
      automaticEnabled: settings.automaticEnabled,
      created: [],
      skippedNoPix: 0,
      skippedIdempotent: 0,
    };
  }

  const candidates = await input.finance.listDriverPayoutCandidates(
    input.limit ?? 500,
  );
  const created = [];
  let skippedNoPix = 0;
  let skippedIdempotent = 0;

  for (const candidate of candidates) {
    if (candidate.availableBalanceCents <= 0) continue;
    if (candidate.destination == null) {
      skippedNoPix += 1;
      continue;
    }
    try {
      const result = await requestDriverPayout(input.finance, {
        driverId: candidate.driverId,
        amountCents: candidate.availableBalanceCents,
        requestedAmountCents: candidate.availableBalanceCents,
        feeCents: 0,
        payoutKind: 'scheduled',
        approvedAt: now,
        idempotencyKey:
          `scheduled:${cycleDate}:${candidate.driverId}`,
        now,
      });
      if (!result.duplicateRequest) created.push(result.payout);
    } catch (error) {
      if (
        error instanceof PayoutDomainError &&
        error.code === 'PAYOUT_IDEMPOTENCY_CONFLICT'
      ) {
        skippedIdempotent += 1;
        continue;
      }
      throw error;
    }
  }

  return {
    cycleDate,
    automaticEnabled: true,
    created,
    skippedNoPix,
    skippedIdempotent,
  };
}

export async function createManualDriverPayouts(input: {
  finance: FinanceRepository;
  driverIds: readonly string[];
  batchId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const uniqueIds = [...new Set(
    input.driverIds.map((id) => id.trim()).filter((id) => id.length >= 3),
  )];
  if (uniqueIds.length === 0 || uniqueIds.length > 250) {
    throw new PayoutDomainError(
      'INVALID_DRIVER',
      'Selecione entre 1 e 250 motoristas para o repasse manual.',
    );
  }

  const candidates = await input.finance.listDriverPayoutCandidates(500);
  const byId = new Map(
    candidates.map((candidate) => [candidate.driverId, candidate]),
  );
  const created = [];
  const skipped: Array<{ driverId: string; reason: string }> = [];

  for (const driverId of uniqueIds) {
    const candidate = byId.get(driverId);
    if (candidate == null || candidate.availableBalanceCents <= 0) {
      skipped.push({ driverId, reason: 'NO_AVAILABLE_BALANCE' });
      continue;
    }
    if (candidate.destination == null) {
      skipped.push({ driverId, reason: 'PIX_DESTINATION_REQUIRED' });
      continue;
    }

    const result = await requestDriverPayout(input.finance, {
      driverId,
      amountCents: candidate.availableBalanceCents,
      requestedAmountCents: candidate.availableBalanceCents,
      feeCents: 0,
      payoutKind: 'manual',
      approvedAt: now,
      idempotencyKey: `manual:${input.batchId}:${driverId}`,
      now,
    });
    if (!result.duplicateRequest) created.push(result.payout);
  }

  return { created, skipped };
}
