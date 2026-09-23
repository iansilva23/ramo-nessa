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
  findOfferById(id: string): Promise<RideOfferRecord | null>;
}
