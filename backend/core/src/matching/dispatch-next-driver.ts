import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import type { PaymentPolicySettingsRepository } from '../payments/payment-policy-settings-repository.js';
import { canDriverAcceptCashRide } from '../payments/cash-policy.js';
import type { RideRepository } from '../rides/ride-repository.js';
import {
  createDriverOffer,
  DEFAULT_DRIVER_OFFER_TTL_SECONDS,
} from './offer-service.js';
import type { GeoPoint } from './select-driver.js';
import { rankEligibleDrivers } from './select-driver.js';
import type { RideMatchingRepository } from './ride-matching-repository.js';
import type { RideOfferRecord } from './ride-offer.js';
import { notifyDefaultPushSubject } from '../notifications/push-notification-service.js';

export type DispatchNextResult =
  | {
      kind: 'OFFER_ACTIVE';
      offer: RideOfferRecord;
    }
  | {
      kind: 'OFFER_CREATED';
      offer: RideOfferRecord;
    }
  | {
      kind: 'NO_DRIVER_FOUND';
    };

export async function dispatchNextDriver(input: {
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  matching: RideMatchingRepository;
  rideId: string;
  pickup: GeoPoint;
  now?: Date;
  offerTtlSeconds?: number;
  maxLocationAgeSeconds?: number;
  finance?: FinanceRepository;
  paymentPolicySettings?: PaymentPolicySettingsRepository;
  canOfferDriver?: (driverId: string) => Promise<boolean>;
}): Promise<DispatchNextResult> {
  const now = input.now ?? new Date();
  const ride = await input.rides.findById(input.rideId);

  if (
    ride == null ||
    (ride.state !== 'PAID' && ride.state !== 'SEARCHING_DRIVER')
  ) {
    throw new Error('Corrida não está pronta para despacho.');
  }

  const offers = await input.matching.listOffersForRide(ride.id);
  for (const offer of offers) {
    if (offer.status !== 'OFFERED') continue;

    if (Date.parse(offer.expiresAt) > now.getTime()) {
      return { kind: 'OFFER_ACTIVE', offer };
    }

    await input.matching.expireOffer({
      offerId: offer.id,
      expiredAt: now.toISOString(),
    });
  }

  const attemptedDriverIds = new Set(offers.map((offer) => offer.driverId));
  let candidates = rankEligibleDrivers({
    ride,
    pickup: input.pickup,
    candidates: await input.drivers.listOnline(),
    now,
    ...(input.maxLocationAgeSeconds != null
      ? { maxLocationAgeSeconds: input.maxLocationAgeSeconds }
      : {}),
  }).filter((candidate) => !attemptedDriverIds.has(candidate.supply.driverId));

  const holdIsActive =
    ride.reservedDriverId != null &&
    ride.driverHoldExpiresAt != null &&
    Date.parse(ride.driverHoldExpiresAt) > now.getTime();

  if (holdIsActive) {
    candidates = candidates.filter(
      (candidate) => candidate.supply.driverId === ride.reservedDriverId,
    );
  }

  if (ride.paymentMethod === 'cash') {
    if (
      input.finance == null ||
      input.paymentPolicySettings == null
    ) {
      throw new Error(
        'Dispatch cash exige política e repositório financeiro.',
      );
    }
    const cashEligible = [];
    for (const candidate of candidates) {
      if (
        await canDriverAcceptCashRide({
          settings: input.paymentPolicySettings,
          finance: input.finance,
          driverId: candidate.supply.driverId,
          additionalCommissionCents:
            ride.quote.platformCommissionCents,
        })
      ) {
        cashEligible.push(candidate);
      }
    }
    candidates = cashEligible;
  }

  if (input.canOfferDriver != null) {
    const allowed = [];
    for (const candidate of candidates) {
      if (await input.canOfferDriver(candidate.supply.driverId)) {
        allowed.push(candidate);
      }
    }
    candidates = allowed;
  }

  const next = candidates[0];
  if (next == null) {
    await input.matching.markNoDriverFound({
      rideId: ride.id,
      at: now.toISOString(),
    });

    notifyDefaultPushSubject({
      subjectType: 'passenger',
      subjectId: ride.passengerId,
      message: {
        type: 'passenger.ride.no_driver',
        title: 'Nenhum motorista disponível',
        body: 'Não encontramos um motorista para esta corrida.',
        data: { rideId: ride.id },
      },
    });

    return { kind: 'NO_DRIVER_FOUND' };
  }

  const created = await createDriverOffer({
    repository: input.matching,
    rideId: ride.id,
    driver: next,
    now,
    ttlSeconds:
      input.offerTtlSeconds ?? DEFAULT_DRIVER_OFFER_TTL_SECONDS,
  });

  notifyDefaultPushSubject({
    subjectType: 'driver',
    subjectId: created.offer.driverId,
    message: {
      type: 'driver.offer.new',
      title: 'Nova corrida',
      body: 'Uma nova corrida está disponível. Abra o app para responder.',
      data: {
        offerId: created.offer.id,
        rideId: created.offer.rideId,
      },
    },
  });

  return { kind: 'OFFER_CREATED', offer: created.offer };
}
