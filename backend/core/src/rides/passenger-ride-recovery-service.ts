import type { OperationalSettingsRepository } from '../config/operational-settings-repository.js';
import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import type { RideMatchingRepository } from '../matching/ride-matching-repository.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import type { PaymentPolicySettingsRepository } from '../payments/payment-policy-settings-repository.js';
import { dispatchRideAfterPayment } from './dispatch-after-payment.js';
import type { RideRepository } from './ride-repository.js';
import { transitionRide } from './ride-state.js';

export class PassengerRideRecoveryError extends Error {
  constructor(
    public readonly code:
      | 'RIDE_NOT_FOUND'
      | 'RIDE_PASSENGER_MISMATCH'
      | 'RIDE_NOT_WAITING_FOR_DECISION',
    message: string,
  ) {
    super(message);
    this.name = 'PassengerRideRecoveryError';
  }
}

async function requirePassengerNoDriverRide(input: {
  rides: RideRepository;
  rideId: string;
  passengerId: string;
}) {
  const ride = await input.rides.findById(input.rideId);
  if (ride == null) {
    throw new PassengerRideRecoveryError(
      'RIDE_NOT_FOUND',
      'Corrida não encontrada.',
    );
  }
  if (ride.passengerId !== input.passengerId) {
    throw new PassengerRideRecoveryError(
      'RIDE_PASSENGER_MISMATCH',
      'Corrida não pertence a este passageiro.',
    );
  }
  if (ride.state !== 'NO_DRIVER_FOUND') {
    throw new PassengerRideRecoveryError(
      'RIDE_NOT_WAITING_FOR_DECISION',
      'Esta corrida não está aguardando uma nova busca ou cancelamento.',
    );
  }
  return ride;
}

export async function retryPassengerRideSearch(input: {
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  matching: RideMatchingRepository;
  passengerId: string;
  rideId: string;
  finance?: FinanceRepository;
  paymentPolicySettings?: PaymentPolicySettingsRepository;
  operationalSettings?: OperationalSettingsRepository;
  canOfferDriver?: (driverId: string) => Promise<boolean>;
  now?: Date;
}) {
  const ride = await requirePassengerNoDriverRide(input);
  const now = input.now ?? new Date();
  const searching = await input.rides.save({
    ...ride,
    state: transitionRide(ride.state, 'SEARCHING_DRIVER'),
    updatedAt: now.toISOString(),
  });

  const dispatch = await dispatchRideAfterPayment({
    ride: searching,
    rides: input.rides,
    drivers: input.drivers,
    matching: input.matching,
    now,
    ...(input.finance == null ? {} : { finance: input.finance }),
    ...(input.paymentPolicySettings == null
      ? {}
      : { paymentPolicySettings: input.paymentPolicySettings }),
    ...(input.operationalSettings == null
      ? {}
      : { operationalSettings: input.operationalSettings }),
    ...(input.canOfferDriver == null
      ? {}
      : { canOfferDriver: input.canOfferDriver }),
    allowPreviouslyAttemptedDrivers: true,
  });

  const latest =
    (await input.rides.findById(ride.id)) ?? searching;
  return {
    ride: latest,
    dispatchStatus:
      dispatch.kind === 'OFFER_CREATED' ||
      dispatch.kind === 'OFFER_ACTIVE'
        ? 'SEARCHING_DRIVER' as const
        : dispatch.kind,
    offer:
      dispatch.kind === 'OFFER_CREATED' ||
      dispatch.kind === 'OFFER_ACTIVE'
        ? dispatch.offer
        : null,
  };
}

export async function cancelPassengerRideAfterNoDriver(input: {
  rides: RideRepository;
  passengerId: string;
  rideId: string;
  now?: Date;
}) {
  const ride = await requirePassengerNoDriverRide(input);
  const instant = (input.now ?? new Date()).toISOString();
  return input.rides.save({
    ...ride,
    state: transitionRide(
      ride.state,
      'CANCELLED_BY_PASSENGER',
    ),
    updatedAt: instant,
  });
}
