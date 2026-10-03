import type { DriverSupplyRepository } from './driver-supply-repository.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import { settleCompletedRide } from '../payments/settlement.js';
import type { RideRepository } from '../rides/ride-repository.js';
import type { RideRecord } from '../rides/ride.js';
import { transitionRide } from '../rides/ride-state.js';
import { DriverAppError } from './driver-app-service.js';

export type DriverRideAction = 'arrive' | 'start' | 'complete';

export function driverRideView(ride: RideRecord) {
  return {
    id: ride.id,
    state: ride.state,
    driverHoldExpiresAt: ride.driverHoldExpiresAt,
    category: ride.category,
    passengers: ride.passengers,
    origin: ride.origin,
    destination: ride.destination,
    pickupLatitude: ride.pickupLatitude,
    pickupLongitude: ride.pickupLongitude,
    dropoffLatitude: ride.dropoffLatitude,
    dropoffLongitude: ride.dropoffLongitude,
    driverEarningsCents: ride.quote.driverNetCents,
    pickupCompensationCents: ride.quote.pickupCompensationCents,
    paymentMethod: ride.paymentMethod ?? null,
    cashCollectionAmountCents:
      ride.paymentMethod === 'cash'
        ? ride.quote.totalAmountCents
        : null,
    cashCommissionCents:
      ride.paymentMethod === 'cash'
        ? ride.quote.platformCommissionCents
        : null,
  };
}

function assertAssignedToDriver(
  ride: RideRecord,
  driverId: string,
): void {
  if (ride.driverId !== driverId) {
    throw new DriverAppError(
      'RIDE_NOT_ASSIGNED_TO_DRIVER',
      'Esta corrida não está atribuída a este motorista.',
    );
  }
}

function invalidAction(ride: RideRecord, action: DriverRideAction): never {
  throw new DriverAppError(
    'INVALID_RIDE_ACTION',
    `Ação ${action} inválida para corrida em ${ride.state}.`,
  );
}

export async function currentDriverRide(input: {
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  driverId: string;
}) {
  const supply = await input.drivers.findByDriverId(input.driverId);
  if (supply == null) {
    throw new DriverAppError(
      'DRIVER_NOT_REGISTERED',
      'Motorista ainda não possui cadastro aprovado.',
    );
  }

  if (!supply.busy) {
    if (supply.reservedRideId == null || Date.parse(supply.reservedUntil ?? '') <= Date.now()) return null;
    const pending = await input.rides.findById(supply.reservedRideId);
    return pending?.state === 'AWAITING_PAYMENT' && pending.driverId === input.driverId
      ? driverRideView(pending) : null;
  }

  const ride = await input.rides.findActiveByDriverId(input.driverId);
  return ride == null ? null : driverRideView(ride);
}

export async function performDriverRideAction(input: {
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  finance: FinanceRepository;
  driverId: string;
  rideId: string;
  action: DriverRideAction;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const instant = now.toISOString();

  const stored = await input.rides.findById(input.rideId);
  if (stored == null) {
    throw new DriverAppError(
      'RIDE_NOT_FOUND',
      'Corrida não encontrada.',
    );
  }

  assertAssignedToDriver(stored, input.driverId);

  if (input.action === 'arrive') {
    if (stored.state === 'DRIVER_ARRIVED') {
      return { ride: driverRideView(stored) };
    }

    let next: RideRecord['state'] = stored.state;
    if (next === 'DRIVER_ASSIGNED') {
      next = transitionRide(next, 'DRIVER_ARRIVING');
    }
    if (next === 'DRIVER_ARRIVING') {
      next = transitionRide(next, 'DRIVER_ARRIVED');
    } else {
      invalidAction(stored, input.action);
    }

    const ride = await input.rides.save({
      ...stored,
      state: next,
      updatedAt: instant,
    });
    return { ride: driverRideView(ride) };
  }

  if (input.action === 'start') {
    if (stored.state === 'IN_PROGRESS') {
      return { ride: driverRideView(stored) };
    }
    if (stored.state !== 'DRIVER_ARRIVED') {
      invalidAction(stored, input.action);
    }

    const ride = await input.rides.save({
      ...stored,
      state: transitionRide(stored.state, 'IN_PROGRESS'),
      updatedAt: instant,
    });
    return { ride: driverRideView(ride) };
  }

  let completed = stored;
  if (completed.state === 'IN_PROGRESS') {
    completed = await input.rides.save({
      ...completed,
      state: transitionRide(completed.state, 'COMPLETED'),
      updatedAt: instant,
    });
  } else if (completed.state !== 'COMPLETED') {
    invalidAction(completed, input.action);
  }

  let duplicateSettlement = false;
  let cashDebtRecoveredCents = 0;
  let cashCommissionRecoveredFromBalanceCents = 0;

  if (completed.paymentMethod === 'cash') {
    const cashSettlement = await input.finance.settleCashRide({
      rideId: completed.id,
      driverId: input.driverId,
      platformCommissionCents:
        completed.quote.platformCommissionCents,
      settledAt: now,
    });
    duplicateSettlement = cashSettlement.duplicateSettlement;
    cashCommissionRecoveredFromBalanceCents =
      cashSettlement.cashCommissionRecoveredFromBalanceCents;
  } else {
    const payment = await input.finance.findPaidPaymentByRideId(
      completed.id,
    );
    if (payment == null) {
      throw new DriverAppError(
        'PAID_PAYMENT_NOT_FOUND',
        'Pagamento confirmado da corrida não foi encontrado.',
      );
    }

    const settlement = await settleCompletedRide(input.finance, {
      ride: completed,
      payment,
      settledAt: now,
    });
    duplicateSettlement = settlement.duplicateSettlement;
    cashDebtRecoveredCents =
      settlement.cashDebtRecoveredCents;
  }

  const supply = await input.drivers.findByDriverId(input.driverId);
  if (supply == null) {
    throw new DriverAppError(
      'DRIVER_NOT_REGISTERED',
      'Motorista ainda não possui cadastro aprovado.',
    );
  }

  const {
    reservedRideId: _reservedRideId,
    reservedUntil: _reservedUntil,
    ...supplyWithoutReservation
  } = supply;

  await input.drivers.upsert({
    ...supplyWithoutReservation,
    busy: false,
    updatedAt: instant,
  });

  const driverBalanceCents =
    await input.finance.getAccountBalanceCents(
      `driver:${input.driverId}:payable`,
    );
  const cashCommissionDebtCents =
    await input.finance.getDriverCashDebtCents(input.driverId);

  return {
    ride: driverRideView(completed),
    settlement: {
      duplicate: duplicateSettlement,
      driverBalanceCents,
      cashCommissionDebtCents,
      cashDebtRecoveredCents,
      cashCommissionRecoveredFromBalanceCents,
    },
  };
}


export const DRIVER_RIDE_CANCELLATION_REASONS = [
  'passenger_no_show',
  'passenger_requested',
  'inappropriate_behavior',
  'threat_aggression',
  'harassment',
  'unsafe_or_inaccessible_location',
  'vehicle_problem',
  'personal_emergency',
  'other',
] as const;

export type DriverRideCancellationReason =
  (typeof DRIVER_RIDE_CANCELLATION_REASONS)[number];

const DRIVER_CANCELLABLE_STATES = new Set<RideRecord['state']>([
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
]);

const SAFETY_REVIEW_REASONS = new Set<DriverRideCancellationReason>([
  'inappropriate_behavior',
  'threat_aggression',
  'harassment',
  'unsafe_or_inaccessible_location',
]);

function normalizeCancellationNote(value?: string): string | undefined {
  const note = value?.trim().replace(/\s+/g, ' ');
  if (!note) return undefined;
  if (
    note.length > 1000 ||
    /[\u0000-\u001f\u007f]/.test(note)
  ) {
    throw new DriverAppError(
      'INVALID_CANCELLATION_REASON',
      'A observação do cancelamento deve ter até 1000 caracteres.',
    );
  }
  return note;
}

export async function cancelDriverRide(input: {
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  driverId: string;
  rideId: string;
  reason: unknown;
  note?: string;
  now?: Date;
}) {
  const reason =
    typeof input.reason === 'string'
      ? input.reason.trim() as DriverRideCancellationReason
      : ('' as DriverRideCancellationReason);

  if (
    !DRIVER_RIDE_CANCELLATION_REASONS.includes(
      reason as DriverRideCancellationReason,
    )
  ) {
    throw new DriverAppError(
      'INVALID_CANCELLATION_REASON',
      'Selecione um motivo válido para cancelar a corrida.',
    );
  }
  const note = normalizeCancellationNote(input.note);
  if (reason === 'other' && (note == null || note.length < 5)) {
    throw new DriverAppError(
      'INVALID_CANCELLATION_REASON',
      'Explique brevemente o motivo do cancelamento.',
    );
  }

  const now = input.now ?? new Date();
  const instant = now.toISOString();
  const stored = await input.rides.findById(input.rideId);
  if (stored == null) {
    throw new DriverAppError(
      'RIDE_NOT_FOUND',
      'Corrida não encontrada.',
    );
  }

  assertAssignedToDriver(stored, input.driverId);

  if (stored.state === 'CANCELLED_BY_DRIVER') {
    return {
      ride: driverRideView(stored),
      previousState: stored.state,
      reason,
      ...(note == null ? {} : { note }),
      requiresAdminReview:
        SAFETY_REVIEW_REASONS.has(reason),
      compensationReviewRequired: false,
      duplicateCancellation: true,
    };
  }

  if (!DRIVER_CANCELLABLE_STATES.has(stored.state)) {
    invalidAction(stored, 'cancel' as DriverRideAction);
  }

  const previousState = stored.state;
  const cancelled = await input.rides.save({
    ...stored,
    state: transitionRide(stored.state, 'CANCELLED_BY_DRIVER'),
    updatedAt: instant,
  });

  const supply = await input.drivers.findByDriverId(input.driverId);
  if (supply != null) {
    const {
      reservedRideId: _reservedRideId,
      reservedUntil: _reservedUntil,
      ...released
    } = supply;
    await input.drivers.upsert({
      ...released,
      busy: false,
      updatedAt: instant,
    });
  }

  const compensationReviewRequired = previousState === 'IN_PROGRESS';
  return {
    ride: driverRideView(cancelled),
    previousState,
    reason,
    ...(note == null ? {} : { note }),
    requiresAdminReview:
      compensationReviewRequired ||
      SAFETY_REVIEW_REASONS.has(reason),
    compensationReviewRequired,
    duplicateCancellation: false,
  };
}
