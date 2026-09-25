import type { OperationalSettingsRepository } from '../config/operational-settings-repository.js';
import type { DriverSupplyRepository } from './driver-supply-repository.js';
import type {
  DriverRegistryRepository,
  DriverVehicleRecord,
} from './driver-registry-repository.js';
import type { DriverDocumentRepository } from './driver-document-repository.js';
import {
  canDriverReceiveNewWork,
  driverOperationalEligibility,
} from './driver-operational-eligibility.js';
import type { RideMatchingRepository } from '../matching/ride-matching-repository.js';
import {
  acceptDriverOffer,
  rejectDriverOffer,
} from '../matching/offer-service.js';
import { dispatchNextDriver } from '../matching/dispatch-next-driver.js';
import type { RideRepository } from '../rides/ride-repository.js';
import type { RideRecord } from '../rides/ride.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import type { PaymentPolicySettingsRepository } from '../payments/payment-policy-settings-repository.js';

export class DriverAppError extends Error {
  constructor(
    public readonly code:
      | 'DRIVER_NOT_REGISTERED'
      | 'DRIVER_REGISTRY_NOT_APPROVED'
      | 'DRIVER_DOCUMENTS_NOT_APPROVED'
      | 'DRIVER_SUPPLY_NOT_INITIALIZED'
      | 'DRIVER_BUSY'
      | 'RIDE_NOT_FOUND'
      | 'RIDE_NOT_PREPARED'
      | 'RIDE_NOT_ASSIGNED_TO_DRIVER'
      | 'INVALID_RIDE_ACTION'
      | 'PAID_PAYMENT_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'DriverAppError';
  }
}

async function requireApprovedDriverRegistry(input: {
  registry: DriverRegistryRepository;
  driverId: string;
}): Promise<DriverVehicleRecord> {
  const [profile, vehicle] = await Promise.all([
    input.registry.findProfile(input.driverId),
    input.registry.findVehicleByDriverId(input.driverId),
  ]);

  if (
    profile == null ||
    vehicle == null ||
    profile.status !== 'approved' ||
    vehicle.status !== 'approved'
  ) {
    throw new DriverAppError(
      'DRIVER_REGISTRY_NOT_APPROVED',
      'Seu perfil e veículo ainda precisam ser aprovados antes de você ficar online.',
    );
  }

  return vehicle;
}

async function requireOperationalDriver(input: {
  registry: DriverRegistryRepository;
  documents: DriverDocumentRepository;
  driverId: string;
  now?: Date;
}): Promise<DriverVehicleRecord> {
  const eligibility = await driverOperationalEligibility(input);
  if (!eligibility.eligible) {
    throw new DriverAppError(
      eligibility.reason === 'registry'
        ? 'DRIVER_REGISTRY_NOT_APPROVED'
        : 'DRIVER_DOCUMENTS_NOT_APPROVED',
      eligibility.reason === 'registry'
        ? 'Seu perfil e veículo ainda precisam ser aprovados antes de você ficar online.'
        : 'Sua CNH e seu CRLV precisam estar aprovados e válidos antes de você receber novas corridas.',
    );
  }
  return eligibility.vehicle;
}

function supplyView(
  supply: Awaited<ReturnType<DriverSupplyRepository['findByDriverId']>>,
) {
  if (supply == null) return null;
  return {
    driverId: supply.driverId,
    vehicleId: supply.vehicleId,
    categories: supply.categories,
    fourByFour: supply.fourByFour,
    seatCapacity: supply.seatCapacity,
    online: supply.online,
    busy: supply.busy,
    latitude: supply.latitude,
    longitude: supply.longitude,
    locationUpdatedAt: supply.locationUpdatedAt,
  };
}

export async function getDriverSupplyForApp(input: {
  drivers: DriverSupplyRepository;
  registry: DriverRegistryRepository;
  driverId: string;
}) {
  const vehicle = await requireApprovedDriverRegistry({
    registry: input.registry,
    driverId: input.driverId,
  });
  const supply = await input.drivers.findByDriverId(input.driverId);
  if (supply == null) {
    throw new DriverAppError(
      'DRIVER_SUPPLY_NOT_INITIALIZED',
      'Cadastro aprovado. Ative a localização para concluir a configuração operacional.',
    );
  }

  return supplyView({
    ...supply,
    vehicleId: vehicle.id,
    categories: vehicle.categories,
    fourByFour: vehicle.fourByFour,
    seatCapacity: vehicle.seatCapacity,
  });
}

export async function updateDriverSupplyFromApp(input: {
  drivers: DriverSupplyRepository;
  registry: DriverRegistryRepository;
  documents: DriverDocumentRepository;
  driverId: string;
  online?: boolean;
  latitude?: number;
  longitude?: number;
  now?: Date;
}) {
  const current = await input.drivers.findByDriverId(input.driverId);

  if (current?.busy && input.online === false) {
    throw new DriverAppError(
      'DRIVER_BUSY',
      'Não é possível ficar offline durante uma corrida ativa.',
    );
  }

  const now = input.now ?? new Date();
  const instant = now.toISOString();

  // Uma corrida já ativa continua enviando localização mesmo se uma
  // aprovação expirar ou for suspensa durante o trajeto. A trava vale
  // para novo trabalho, nunca para interromper o acompanhamento atual.
  if (current?.busy) {
    return input.drivers.upsert({
      ...current,
      ...(input.latitude != null && input.longitude != null
        ? {
            latitude: input.latitude,
            longitude: input.longitude,
            locationUpdatedAt: instant,
          }
        : {}),
      updatedAt: instant,
    });
  }

  const willBeOnline = input.online ?? current?.online ?? false;
  let vehicle: DriverVehicleRecord;

  if (willBeOnline) {
    try {
      vehicle = await requireOperationalDriver({
        registry: input.registry,
        documents: input.documents,
        driverId: input.driverId,
        now,
      });
    } catch (error) {
      if (current?.online) {
        await input.drivers.upsert({
          ...current,
          online: false,
          updatedAt: instant,
        });
      }
      throw error;
    }
  } else {
    vehicle = await requireApprovedDriverRegistry({
      registry: input.registry,
      driverId: input.driverId,
    });
  }

  if (current == null) {
    if (input.latitude == null || input.longitude == null) {
      throw new DriverAppError(
        'DRIVER_SUPPLY_NOT_INITIALIZED',
        'A localização atual é necessária para concluir a configuração operacional.',
      );
    }

    return input.drivers.upsert({
      driverId: input.driverId,
      vehicleId: vehicle.id,
      categories: vehicle.categories,
      fourByFour: vehicle.fourByFour,
      seatCapacity: vehicle.seatCapacity,
      online: input.online ?? false,
      busy: false,
      latitude: input.latitude,
      longitude: input.longitude,
      locationUpdatedAt: instant,
      updatedAt: instant,
    });
  }

  return input.drivers.upsert({
    ...current,
    vehicleId: vehicle.id,
    categories: vehicle.categories,
    fourByFour: vehicle.fourByFour,
    seatCapacity: vehicle.seatCapacity,
    ...(input.online != null ? { online: input.online } : {}),
    ...(input.latitude != null && input.longitude != null
      ? {
          latitude: input.latitude,
          longitude: input.longitude,
          locationUpdatedAt: instant,
        }
      : {}),
    updatedAt: instant,
  });
}

export function driverOfferView(offer: {
  id: string;
  rideId: string;
  approximatePickupDistanceKm: number;
  expiresAt: string;
}, ride: RideRecord) {
  return {
    id: offer.id,
    rideId: offer.rideId,
    expiresAt: offer.expiresAt,
    approximatePickupDistanceKm: offer.approximatePickupDistanceKm,
    tripDistanceKm: ride.tripDistanceKm ?? null,
    pickupLatitude: ride.pickupLatitude ?? null,
    pickupLongitude: ride.pickupLongitude ?? null,
    dropoffLatitude: ride.dropoffLatitude ?? null,
    dropoffLongitude: ride.dropoffLongitude ?? null,
    category: ride.category,
    passengers: ride.passengers,
    origin: ride.origin,
    destination: ride.destination,
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

export async function currentDriverOffer(input: {
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  registry: DriverRegistryRepository;
  documents: DriverDocumentRepository;
  matching: RideMatchingRepository;
  driverId: string;
  finance?: FinanceRepository;
  paymentPolicySettings?: PaymentPolicySettingsRepository;
  operationalSettings?: OperationalSettingsRepository;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await requireOperationalDriver({
    registry: input.registry,
    documents: input.documents,
    driverId: input.driverId,
    now,
  });
  const offer = await input.matching.findLatestOfferedForDriver(
    input.driverId,
  );
  if (offer == null) return null;

  const ride = await input.rides.findById(offer.rideId);
  if (ride == null) {
    throw new DriverAppError(
      'RIDE_NOT_FOUND',
      'Corrida da oferta não foi encontrada.',
    );
  }

  if (Date.parse(offer.expiresAt) <= now.getTime()) {
    await input.matching.expireOffer({
      offerId: offer.id,
      expiredAt: now.toISOString(),
    });

    if (
      ride.pickupLatitude != null &&
      ride.pickupLongitude != null &&
      (ride.state === 'PAID' || ride.state === 'SEARCHING_DRIVER')
    ) {
      await dispatchNextDriver({
        rides: input.rides,
        drivers: input.drivers,
        matching: input.matching,
        rideId: ride.id,
        pickup: {
          latitude: ride.pickupLatitude,
          longitude: ride.pickupLongitude,
        },
        ...(input.finance != null
          ? { finance: input.finance }
          : {}),
        ...(input.paymentPolicySettings != null
          ? {
              paymentPolicySettings:
                input.paymentPolicySettings,
            }
          : {}),
        ...(input.operationalSettings != null
          ? { operationalSettings: input.operationalSettings }
          : {}),
        canOfferDriver: (driverId) =>
          canDriverReceiveNewWork({
            registry: input.registry,
            documents: input.documents,
            driverId,
            now,
          }),
        now,
      });
    }

    return null;
  }

  return driverOfferView(offer, ride);
}

export async function acceptOfferFromDriverApp(input: {
  rides: RideRepository;
  registry: DriverRegistryRepository;
  documents: DriverDocumentRepository;
  matching: RideMatchingRepository;
  offerId: string;
  driverId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await requireOperationalDriver({
    registry: input.registry,
    documents: input.documents,
    driverId: input.driverId,
    now,
  });
  const result = await acceptDriverOffer({
    repository: input.matching,
    offerId: input.offerId,
    driverId: input.driverId,
    now,
  });

  return {
    offerId: result.offer.id,
    ride: {
      id: result.ride.id,
      state: result.ride.state,
      category: result.ride.category,
      passengers: result.ride.passengers,
      origin: result.ride.origin,
      destination: result.ride.destination,
      pickupLatitude: result.ride.pickupLatitude,
      pickupLongitude: result.ride.pickupLongitude,
      dropoffLatitude: result.ride.dropoffLatitude,
      dropoffLongitude: result.ride.dropoffLongitude,
      driverEarningsCents: result.ride.quote.driverNetCents,
      pickupCompensationCents:
        result.ride.quote.pickupCompensationCents,
      paymentMethod: result.ride.paymentMethod ?? null,
      cashCollectionAmountCents:
        result.ride.paymentMethod === 'cash'
          ? result.ride.quote.totalAmountCents
          : null,
      cashCommissionCents:
        result.ride.paymentMethod === 'cash'
          ? result.ride.quote.platformCommissionCents
          : null,
    },
  };
}

export async function rejectOfferFromDriverApp(input: {
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  matching: RideMatchingRepository;
  offerId: string;
  driverId: string;
  finance?: FinanceRepository;
  paymentPolicySettings?: PaymentPolicySettingsRepository;
  operationalSettings?: OperationalSettingsRepository;
  canOfferDriver?: (driverId: string) => Promise<boolean>;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const rejected = await rejectDriverOffer({
    repository: input.matching,
    offerId: input.offerId,
    driverId: input.driverId,
    now,
  });

  const ride = await input.rides.findById(rejected.rideId);
  if (ride == null) {
    throw new DriverAppError(
      'RIDE_NOT_FOUND',
      'Corrida da oferta não foi encontrada.',
    );
  }

  if (
    ride.pickupLatitude == null ||
    ride.pickupLongitude == null
  ) {
    throw new DriverAppError(
      'RIDE_NOT_PREPARED',
      'Corrida não possui ponto de embarque preparado.',
    );
  }

  const dispatch = await dispatchNextDriver({
    rides: input.rides,
    drivers: input.drivers,
    matching: input.matching,
    rideId: ride.id,
    pickup: {
      latitude: ride.pickupLatitude,
      longitude: ride.pickupLongitude,
    },
    ...(input.finance != null
      ? { finance: input.finance }
      : {}),
    ...(input.paymentPolicySettings != null
      ? {
          paymentPolicySettings:
            input.paymentPolicySettings,
        }
      : {}),
    ...(input.operationalSettings != null
      ? { operationalSettings: input.operationalSettings }
      : {}),
    ...(input.canOfferDriver != null
      ? { canOfferDriver: input.canOfferDriver }
      : {}),
    now,
  });

  return {
    rejectedOfferId: rejected.id,
    retryStatus:
      dispatch.kind === 'OFFER_CREATED' ||
      dispatch.kind === 'OFFER_ACTIVE'
        ? 'SEARCHING_DRIVER'
        : dispatch.kind,
  };
}
