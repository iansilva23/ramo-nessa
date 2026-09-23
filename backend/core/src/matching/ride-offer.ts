export type RideOfferStatus =
  | 'OFFERED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface RideOfferRecord {
  id: string;
  rideId: string;
  driverId: string;
  status: RideOfferStatus;
  approximatePickupDistanceKm: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export class RideOfferError extends Error {
  constructor(
    public readonly code:
      | 'RIDE_NOT_READY'
      | 'ACTIVE_OFFER_EXISTS'
      | 'OFFER_NOT_FOUND'
      | 'OFFER_DRIVER_MISMATCH'
      | 'OFFER_NOT_ACTIVE'
      | 'OFFER_EXPIRED'
      | 'DRIVER_NOT_AVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'RideOfferError';
  }
}
