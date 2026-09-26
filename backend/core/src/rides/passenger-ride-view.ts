import type {
  RideQuoteSnapshot,
  RideRecord,
} from './ride.js';

export function publicRideQuoteView(
  quote: RideQuoteSnapshot,
) {
  return {
    ruleId: quote.ruleId,
    ...(quote.catalogVersion == null
      ? {}
      : { catalogVersion: quote.catalogVersion }),
    ...(quote.catalogVersionId == null
      ? {}
      : { catalogVersionId: quote.catalogVersionId }),
    ...(quote.catalogVersionNumber == null
      ? {}
      : {
          catalogVersionNumber:
            quote.catalogVersionNumber,
        }),
    baseAmountCents: quote.baseAmountCents,
    pickupCompensationCents:
      quote.pickupCompensationCents,
    totalAmountCents: quote.totalAmountCents,
  };
}

export function passengerRideView(ride: RideRecord) {
  const {
    reservedDriverId: _reservedDriverId,
    ...publicRide
  } = ride;

  return {
    ...publicRide,
    quote: publicRideQuoteView(ride.quote),
  };
}
