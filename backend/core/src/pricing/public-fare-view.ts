import type { FareQuote } from './types.js';

export function publicFareQuoteView(quote: FareQuote) {
  if (quote.kind === 'exact') {
    return {
      kind: quote.kind,
      ruleId: quote.ruleId,
      baseAmountCents: quote.baseAmountCents,
      pickupCompensationCents: quote.pickupCompensationCents,
      totalAmountCents: quote.totalAmountCents,
    };
  }

  return {
    kind: quote.kind,
    ruleId: quote.ruleId,
    minBaseAmountCents: quote.minBaseAmountCents,
    maxBaseAmountCents: quote.maxBaseAmountCents,
    pickupCompensationCents: quote.pickupCompensationCents,
    minTotalAmountCents: quote.minTotalAmountCents,
    maxTotalAmountCents: quote.maxTotalAmountCents,
    requiresExactResolution: quote.requiresExactResolution,
  };
}
