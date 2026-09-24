import type { RideRecord } from './ride.js';
import { publicFareQuoteView } from '../pricing/public-fare-view.js';

export function passengerRideView(ride: RideRecord) {
  const {
    reservedDriverId: _reservedDriverId,
    ...publicRide
  } = ride;

  return {
    ...publicRide,
    quote: publicFareQuoteView(ride.quote),
  };
}
