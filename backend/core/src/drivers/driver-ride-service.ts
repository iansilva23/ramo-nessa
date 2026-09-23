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
    category: ride.category,
    passengers: ride.passengers,
    origin: ride.origin,
    destination: ride.destination,
    pickupLatitude: ride.pickupLatitude,
    pickupLongitude: ride.pickupLongitude,
    driverEarningsCents: ride.quote.driverNetCents,
    pickupCompensationCents: ride.quote.pickupCompensationCents,
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

  if (!supply.busy) return null;

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

  return {
    ride: driverRideView(completed),
    settlement: {
      duplicate: settlement.duplicateSettlement,
      driverBalanceCents,
    },
  };
}
