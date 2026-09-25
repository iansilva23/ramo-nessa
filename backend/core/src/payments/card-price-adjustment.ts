export const DEFAULT_CARD_PRICE_ADJUSTMENT_BPS = 498;
export const MAX_CARD_PRICE_ADJUSTMENT_BPS = 2_000;

export interface CardPriceBreakdown {
  baseFareAmountCents: number;
  cardPriceAdjustmentBps: number;
  priceAdjustmentCents: number;
  totalAmountCents: number;
}

export function cardPriceForBaseFare(
  baseFareAmountCents: number,
  cardPriceAdjustmentBps = DEFAULT_CARD_PRICE_ADJUSTMENT_BPS,
): CardPriceBreakdown {
  if (
    !Number.isInteger(baseFareAmountCents) ||
    baseFareAmountCents <= 0
  ) {
    throw new Error('Tarifa-base inválida para preço no cartão.');
  }
  if (
    !Number.isInteger(cardPriceAdjustmentBps) ||
    cardPriceAdjustmentBps < 0 ||
    cardPriceAdjustmentBps > MAX_CARD_PRICE_ADJUSTMENT_BPS
  ) {
    throw new Error('Percentual de ajuste do cartão inválido.');
  }

  if (cardPriceAdjustmentBps === 0) {
    return {
      baseFareAmountCents,
      cardPriceAdjustmentBps,
      priceAdjustmentCents: 0,
      totalAmountCents: baseFareAmountCents,
    };
  }

  const denominator = 10_000 - cardPriceAdjustmentBps;
  const totalAmountCents = Math.ceil(
    (baseFareAmountCents * 10_000) / denominator,
  );

  return {
    baseFareAmountCents,
    cardPriceAdjustmentBps,
    priceAdjustmentCents:
      totalAmountCents - baseFareAmountCents,
    totalAmountCents,
  };
}
