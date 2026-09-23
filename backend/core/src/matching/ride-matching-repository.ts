import type { RideRecord } from '../rides/ride.js';
import type { RideOfferRecord } from './ride-offer.js';

export interface CreateRideOfferInput {
  rideId: string;
  driverId: string;
  approximatePickupDistanceKm: number;
  expiresAt: string;
  createdAt: string;
}

export interface AcceptRideOfferInput {
  offerId: string;
  driverId: string;
  acceptedAt: string;
}

export interface RejectRideOfferInput {
  offerId: string;
  driverId: string;
  rejectedAt: string;
}

export interface ExpireRideOfferInput {
  offerId: string;
  expiredAt: string;
}

export interface MarkNoDriverFoundInput {
  rideId: string;
  at: string;
}

export interface RideOfferMutationResult {
  ride: RideRecord;
  offer: RideOfferRecord;
}

export interface RideMatchingRepository {
  createOffer(
    input: CreateRideOfferInput,
  ): Promise<RideOfferMutationResult>;
  acceptOffer(
    input: AcceptRideOfferInput,
  ): Promise<RideOfferMutationResult>;
  rejectOffer(input: RejectRideOfferInput): Promise<RideOfferRecord>;
  expireOffer(input: ExpireRideOfferInput): Promise<RideOfferRecord>;
  markNoDriverFound(input: MarkNoDriverFoundInput): Promise<RideRecord>;
  findOfferById(id: string): Promise<RideOfferRecord | null>;
  listOffersForRide(rideId: string): Promise<RideOfferRecord[]>;
}
