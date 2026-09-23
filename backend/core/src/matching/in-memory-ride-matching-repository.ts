import { randomUUID } from 'node:crypto';

import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import type { RideRepository } from '../rides/ride-repository.js';
import { transitionRide } from '../rides/ride-state.js';
import type {
  AcceptRideOfferInput,
  CreateRideOfferInput,
  ExpireRideOfferInput,
  MarkNoDriverFoundInput,
  RejectRideOfferInput,
  RideMatchingRepository,
  RideOfferMutationResult,
} from './ride-matching-repository.js';
import {
  RideOfferError,
  type RideOfferRecord,
} from './ride-offer.js';

export class InMemoryRideMatchingRepository
    implements RideMatchingRepository {
  private readonly offers = new Map<string, RideOfferRecord>();

  constructor(
    private readonly rides: RideRepository,
    private readonly drivers: DriverSupplyRepository,
  ) {}

  async findOfferById(id: string): Promise<RideOfferRecord | null> {
    const offer = this.offers.get(id);
    return offer == null ? null : structuredClone(offer);
  }

  async findLatestOfferedForDriver(
    driverId: string,
  ): Promise<RideOfferRecord | null> {
    const offers = [...this.offers.values()]
      .filter(
        (offer) =>
          offer.driverId === driverId &&
          offer.status === 'OFFERED',
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return offers[0] == null ? null : structuredClone(offers[0]);
  }

  async listOffersForRide(rideId: string): Promise<RideOfferRecord[]> {
    return [...this.offers.values()]
      .filter((offer) => offer.rideId === rideId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((offer) => structuredClone(offer));
  }

  async createOffer(
    input: CreateRideOfferInput,
  ): Promise<RideOfferMutationResult> {
    const ride = await this.rides.findById(input.rideId);
    if (ride == null || (ride.state !== 'PAID' && ride.state !== 'SEARCHING_DRIVER')) {
      throw new RideOfferError(
        'RIDE_NOT_READY',
        'Corrida não está pronta para receber oferta.',
      );
    }

    const driver = await this.drivers.findByDriverId(input.driverId);
    const activeHoldByAnotherRide =
      driver?.reservedRideId != null &&
      driver.reservedUntil != null &&
      Date.parse(driver.reservedUntil) > Date.parse(input.createdAt) &&
      driver.reservedRideId !== ride.id;
    if (
      driver == null ||
      !driver.online ||
      driver.busy ||
      activeHoldByAnotherRide
    ) {
      throw new RideOfferError(
        'DRIVER_NOT_AVAILABLE',
        'Motorista não está disponível para oferta.',
      );
    }

    const createdAt = Date.parse(input.createdAt);
    for (const offer of this.offers.values()) {
      if (
        offer.rideId === ride.id &&
        offer.status === 'OFFERED' &&
        Date.parse(offer.expiresAt) > createdAt
      ) {
        throw new RideOfferError(
          'ACTIVE_OFFER_EXISTS',
          'Já existe uma oferta ativa para esta corrida.',
        );
      }
    }

    const updatedRide =
      ride.state === 'PAID'
        ? await this.rides.save({
            ...ride,
            state: transitionRide(ride.state, 'SEARCHING_DRIVER'),
            updatedAt: input.createdAt,
          })
        : ride;

    const offer: RideOfferRecord = {
      id: randomUUID(),
      rideId: ride.id,
      driverId: input.driverId,
      status: 'OFFERED',
      approximatePickupDistanceKm: input.approximatePickupDistanceKm,
      expiresAt: input.expiresAt,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };

    this.offers.set(offer.id, structuredClone(offer));
    return {
      ride: structuredClone(updatedRide),
      offer: structuredClone(offer),
    };
  }

  async rejectOffer(
    input: RejectRideOfferInput,
  ): Promise<RideOfferRecord> {
    const offer = this.offers.get(input.offerId);
    if (offer == null) {
      throw new RideOfferError('OFFER_NOT_FOUND', 'Oferta não encontrada.');
    }
    if (offer.driverId !== input.driverId) {
      throw new RideOfferError(
        'OFFER_DRIVER_MISMATCH',
        'Oferta pertence a outro motorista.',
      );
    }
    if (offer.status !== 'OFFERED') {
      throw new RideOfferError(
        'OFFER_NOT_ACTIVE',
        'Oferta não está mais ativa.',
      );
    }

    if (Date.parse(offer.expiresAt) <= Date.parse(input.rejectedAt)) {
      const expired: RideOfferRecord = {
        ...offer,
        status: 'EXPIRED',
        updatedAt: input.rejectedAt,
      };
      this.offers.set(offer.id, structuredClone(expired));
      throw new RideOfferError('OFFER_EXPIRED', 'Oferta expirou.');
    }

    const rejected: RideOfferRecord = {
      ...offer,
      status: 'REJECTED',
      updatedAt: input.rejectedAt,
    };
    this.offers.set(offer.id, structuredClone(rejected));

    const ride = await this.rides.findById(offer.rideId);
    if (ride?.reservedDriverId === offer.driverId) {
      const {
        reservedDriverId: _reservedDriverId,
        driverHoldExpiresAt: _driverHoldExpiresAt,
        ...rideWithoutHold
      } = ride;
      await this.rides.save({
        ...rideWithoutHold,
        updatedAt: input.rejectedAt,
      });
    }

    const driver = await this.drivers.findByDriverId(offer.driverId);
    if (driver?.reservedRideId === offer.rideId) {
      const {
        reservedRideId: _reservedRideId,
        reservedUntil: _reservedUntil,
        ...releasedDriver
      } = driver;
      await this.drivers.upsert({
        ...releasedDriver,
        updatedAt: input.rejectedAt,
      });
    }

    return structuredClone(rejected);
  }

  async expireOffer(
    input: ExpireRideOfferInput,
  ): Promise<RideOfferRecord> {
    const offer = this.offers.get(input.offerId);
    if (offer == null) {
      throw new RideOfferError('OFFER_NOT_FOUND', 'Oferta não encontrada.');
    }
    if (offer.status === 'EXPIRED') return structuredClone(offer);
    if (offer.status !== 'OFFERED') {
      throw new RideOfferError(
        'OFFER_NOT_ACTIVE',
        'Oferta não está mais ativa.',
      );
    }
    if (Date.parse(offer.expiresAt) > Date.parse(input.expiredAt)) {
      throw new RideOfferError(
        'OFFER_NOT_EXPIRED',
        'Oferta ainda não expirou.',
      );
    }

    const expired: RideOfferRecord = {
      ...offer,
      status: 'EXPIRED',
      updatedAt: input.expiredAt,
    };
    this.offers.set(offer.id, structuredClone(expired));

    const ride = await this.rides.findById(offer.rideId);
    if (ride?.reservedDriverId === offer.driverId) {
      const {
        reservedDriverId: _reservedDriverId,
        driverHoldExpiresAt: _driverHoldExpiresAt,
        ...rideWithoutHold
      } = ride;
      await this.rides.save({
        ...rideWithoutHold,
        updatedAt: input.expiredAt,
      });
    }

    const driver = await this.drivers.findByDriverId(offer.driverId);
    if (driver?.reservedRideId === offer.rideId) {
      const {
        reservedRideId: _reservedRideId,
        reservedUntil: _reservedUntil,
        ...releasedDriver
      } = driver;
      await this.drivers.upsert({
        ...releasedDriver,
        updatedAt: input.expiredAt,
      });
    }

    return structuredClone(expired);
  }

  async markNoDriverFound(
    input: MarkNoDriverFoundInput,
  ): Promise<import('../rides/ride.js').RideRecord> {
    const ride = await this.rides.findById(input.rideId);
    if (
      ride == null ||
      (ride.state !== 'PAID' && ride.state !== 'SEARCHING_DRIVER')
    ) {
      throw new RideOfferError(
        'RIDE_NOT_READY',
        'Corrida não está em busca de motorista.',
      );
    }

    const atMs = Date.parse(input.at);
    for (const offer of this.offers.values()) {
      if (
        offer.rideId === ride.id &&
        offer.status === 'OFFERED' &&
        Date.parse(offer.expiresAt) > atMs
      ) {
        throw new RideOfferError(
          'ACTIVE_OFFER_EXISTS',
          'Ainda existe uma oferta ativa para esta corrida.',
        );
      }
    }

    if (ride.reservedDriverId != null) {
      const driver = await this.drivers.findByDriverId(
        ride.reservedDriverId,
      );
      if (driver?.reservedRideId === ride.id) {
        const {
          reservedRideId: _reservedRideId,
          reservedUntil: _reservedUntil,
          ...releasedDriver
        } = driver;
        await this.drivers.upsert({
          ...releasedDriver,
          updatedAt: input.at,
        });
      }
    }

    const searching =
      ride.state === 'PAID'
        ? transitionRide(ride.state, 'SEARCHING_DRIVER')
        : ride.state;
    return this.rides.save({
      ...ride,
      state: transitionRide(searching, 'NO_DRIVER_FOUND'),
      updatedAt: input.at,
    });
  }

  async acceptOffer(
    input: AcceptRideOfferInput,
  ): Promise<RideOfferMutationResult> {
    const offer = this.offers.get(input.offerId);
    if (offer == null) {
      throw new RideOfferError('OFFER_NOT_FOUND', 'Oferta não encontrada.');
    }

    if (offer.driverId !== input.driverId) {
      throw new RideOfferError(
        'OFFER_DRIVER_MISMATCH',
        'Oferta pertence a outro motorista.',
      );
    }

    if (offer.status !== 'OFFERED') {
      throw new RideOfferError(
        'OFFER_NOT_ACTIVE',
        'Oferta não está mais ativa.',
      );
    }

    if (Date.parse(offer.expiresAt) <= Date.parse(input.acceptedAt)) {
      const expired = {
        ...offer,
        status: 'EXPIRED' as const,
        updatedAt: input.acceptedAt,
      };
      this.offers.set(offer.id, expired);
      throw new RideOfferError('OFFER_EXPIRED', 'Oferta expirou.');
    }

    const ride = await this.rides.findById(offer.rideId);
    if (
      ride == null ||
      ride.state !== 'SEARCHING_DRIVER' ||
      ride.driverId != null
    ) {
      throw new RideOfferError(
        'RIDE_NOT_READY',
        'Corrida não está disponível para aceite.',
      );
    }

    const driver = await this.drivers.findByDriverId(input.driverId);
    if (driver == null || !driver.online || driver.busy) {
      throw new RideOfferError(
        'DRIVER_NOT_AVAILABLE',
        'Motorista não está mais disponível.',
      );
    }

    const accepted: RideOfferRecord = {
      ...offer,
      status: 'ACCEPTED',
      updatedAt: input.acceptedAt,
    };
    const {
      reservedDriverId: _reservedDriverId,
      driverHoldExpiresAt: _driverHoldExpiresAt,
      ...rideWithoutHold
    } = ride;
    const assigned = await this.rides.save({
      ...rideWithoutHold,
      state: transitionRide(ride.state, 'DRIVER_ASSIGNED'),
      driverId: input.driverId,
      updatedAt: input.acceptedAt,
    });
    const {
      reservedRideId: _reservedRideId,
      reservedUntil: _reservedUntil,
      ...driverWithoutHold
    } = driver;
    await this.drivers.upsert({
      ...driverWithoutHold,
      busy: true,
      updatedAt: input.acceptedAt,
    });

    this.offers.set(offer.id, structuredClone(accepted));

    return {
      ride: structuredClone(assigned),
      offer: structuredClone(accepted),
    };
  }
}
