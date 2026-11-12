import type { RideRecord } from './ride.js';
import type { RideRepository } from './ride-repository.js';
import type { RideMatchingRepository } from '../matching/ride-matching-repository.js';
import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import type { DriverRegistryRepository } from '../drivers/driver-registry-repository.js';
import type { RoutingRouteProvider } from '../routing/route-provider.js';
import { driverPhotoPath } from '../drivers/driver-profile-photo-service.js';
import { DEFAULT_DRIVER_OFFER_TTL_SECONDS } from '../matching/offer-service.js';
import { passengerRideView } from './passenger-ride-view.js';

export async function createPrepaymentDriverOffer(input: {
  ride: RideRecord; matching: RideMatchingRepository; now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.ride.state !== 'AWAITING_PAYMENT' ||
      !input.ride.driverConsentRequired || input.ride.reservedDriverId == null) {
    throw new Error('A solicitação precisa de uma reserva antes da oferta.');
  }
  const holdExpiryMs = Date.parse(input.ride.driverHoldExpiresAt ?? '');
  if (!Number.isFinite(holdExpiryMs) || holdExpiryMs <= now.getTime()) {
    throw new Error('A reserva do motorista está vencida ou possui prazo inválido.');
  }
  const result = await input.matching.createOffer({
    rideId: input.ride.id, driverId: input.ride.reservedDriverId,
    approximatePickupDistanceKm: input.ride.driverPickupDistanceKm ?? 0,
    createdAt: now.toISOString(),
    expiresAt: new Date(Math.min(now.getTime() + DEFAULT_DRIVER_OFFER_TTL_SECONDS * 1000,
      holdExpiryMs)).toISOString(),
  });
  return result.offer;
}

export async function prepaymentDriverConfirmation(input: {
  rides: RideRepository; matching: RideMatchingRepository; drivers: DriverSupplyRepository;
  registry: DriverRegistryRepository; routing: RoutingRouteProvider | null;
  rideId: string; passengerId: string; now?: Date;
}) {
  const ride = await input.rides.findById(input.rideId);
  if (ride == null || ride.passengerId !== input.passengerId) return null;
  const now = input.now ?? new Date();
  const offers = await input.matching.listOffersForRide(ride.id);
  const offer = offers.at(-1);
  const base = { ride: passengerRideView(ride), holdExpiresAt: ride.driverHoldExpiresAt ?? now.toISOString() };
  const holdExpiryMs = Date.parse(ride.driverHoldExpiresAt ?? '');
  if (ride.state !== 'AWAITING_PAYMENT' ||
      !Number.isFinite(holdExpiryMs) || holdExpiryMs <= now.getTime()) {
    return { ...base, status: 'EXPIRED', driver: null };
  }
  if (offer == null) return { ...base, status: 'NOT_STARTED', driver: null };
  if (offer?.status === 'OFFERED') {
    const offerExpiryMs = Date.parse(offer.expiresAt);
    if (!Number.isFinite(offerExpiryMs) || offerExpiryMs <= now.getTime()) {
      await input.matching.expireOffer({ offerId: offer.id, expiredAt: now.toISOString() });
      return { ...base, status: 'NO_DRIVER_FOUND', driver: null };
    }
    return { ...base, status: 'WAITING_ACCEPTANCE', driver: null };
  }
  if (offer?.status !== 'ACCEPTED' || ride.driverId !== offer.driverId) {
    return { ...base, status: 'NO_DRIVER_FOUND', driver: null };
  }
  const [profile, vehicle, supply] = await Promise.all([
    input.registry.findProfile(offer.driverId), input.registry.findVehicleByDriverId(offer.driverId),
    input.drivers.findByDriverId(offer.driverId),
  ]);
  if (profile?.status !== 'approved' || vehicle?.status !== 'approved' || supply == null ||
      !supply.online || supply.busy || supply.reservedRideId !== ride.id ||
      !Number.isFinite(supply.latitude) || supply.latitude < -90 || supply.latitude > 90 ||
      !Number.isFinite(supply.longitude) || supply.longitude < -180 || supply.longitude > 180 ||
      ride.reservedDriverId !== offer.driverId ||
      supply.vehicleId !== vehicle.id ||
      !supply.categories.includes(ride.category) ||
      supply.seatCapacity < ride.passengers ||
      (ride.requiresFourByFour === true && (!vehicle.fourByFour || !supply.fourByFour)) ||
      !Number.isFinite(Date.parse(supply.reservedUntil ?? '')) ||
      Date.parse(supply.reservedUntil ?? '') <= now.getTime() ||
      !Number.isFinite(Date.parse(supply.locationUpdatedAt)) ||
      Date.parse(supply.locationUpdatedAt) > now.getTime() ||
      now.getTime() - Date.parse(supply.locationUpdatedAt) > 120_000) {
    return { ...base, status: 'NO_DRIVER_FOUND', driver: null };
  }
  let arrivalSeconds: number | null = null;
  if (input.routing != null && ride.pickupLatitude != null && ride.pickupLongitude != null) {
    try {
      const route = await input.routing.route({
        from: { latitude: supply.latitude, longitude: supply.longitude },
        to: { latitude: ride.pickupLatitude, longitude: ride.pickupLongitude },
      });
      if (Number.isFinite(route.durationSeconds) && route.durationSeconds >= 0) {
        arrivalSeconds = Math.ceil(route.durationSeconds);
      }
    } catch { /* A missing estimate must never be replaced with a fabricated ETA. */ }
  }
  return { ...base, status: 'READY_TO_PAY', driver: {
    id: offer.driverId, displayName: profile.preferredName?.trim() || profile.fullName,
    photoPath: driverPhotoPath(offer.driverId, profile.photoUpdatedAt) ?? null,
    ratingAverage: profile.ratingAverage ?? null, ratingCount: profile.ratingCount ?? 0,
    vehicle: `${vehicle.make} ${vehicle.model}`, plate: vehicle.plateNormalized,
    arrivalSeconds,
  } };
}
