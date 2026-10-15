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
    promotion: _promotion,
    ...publicRide
  } = ride;

  return {
    ...publicRide,
    quote: publicRideQuoteView(ride.quote),
    ...(ride.promotion == null
      ? {}
      : {
          promotion: {
            campaignId: ride.promotion.campaignId,
            code: ride.promotion.code,
            name: ride.promotion.name,
            kind: ride.promotion.kind,
            normalTotalCents: ride.promotion.normalTotalCents,
            discountCents: ride.promotion.discountCents,
            passengerPayableCents:
              ride.promotion.passengerPayableCents,
          },
        }),
  };
}
