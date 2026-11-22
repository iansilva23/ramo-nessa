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
  paymentHoldSeconds?: number;
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

export interface CancelRideByAdminInput {
  rideId: string;
  cancelledAt: string;
}

export interface CancelRideByAdminResult {
  ride: RideRecord;
  alreadyCancelled: boolean;
  cancelledOffers: number;
  releasedDriverId: string | null;
}

export interface RideMatchingRepository {
  lockDriverScreen?(input: {driverId:string; at:string}): Promise<{outcome:'OFFLINE' | 'ACCEPTED' | 'OFFER_PENDING'; offerId?:string}>;
  lockScreenPendingOffer?(input: { offerId: string; driverId: string; at: string }): Promise<'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'INACTIVE'>;
  releasePrepaymentHold(input: { rideId: string; at: string; cancelledByDriverId?: string }): Promise<RideRecord>;
  createOffer(
    input: CreateRideOfferInput,
  ): Promise<RideOfferMutationResult>;
  acceptOffer(
    input: AcceptRideOfferInput,
  ): Promise<RideOfferMutationResult>;
  rejectOffer(input: RejectRideOfferInput): Promise<RideOfferRecord>;
  expireOffer(input: ExpireRideOfferInput): Promise<RideOfferRecord>;
  markNoDriverFound(input: MarkNoDriverFoundInput): Promise<RideRecord>;
  cancelRideByAdmin(
    input: CancelRideByAdminInput,
  ): Promise<CancelRideByAdminResult>;
  findOfferById(id: string): Promise<RideOfferRecord | null>;
  findLatestOfferedForDriver(
    driverId: string,
  ): Promise<RideOfferRecord | null>;
  listOffersForRide(rideId: string): Promise<RideOfferRecord[]>;
}
