export const DEFAULT_PIX_PRICE_ADJUSTMENT_BPS = 99;
export const MAX_PIX_PRICE_ADJUSTMENT_BPS = 2_000;

export interface PixPriceBreakdown {
  baseFareAmountCents: number;
  pixPriceAdjustmentBps: number;
  priceAdjustmentCents: number;
  totalAmountCents: number;
}

export function pixPriceForBaseFare(
  baseFareAmountCents: number,
  pixPriceAdjustmentBps = DEFAULT_PIX_PRICE_ADJUSTMENT_BPS,
): PixPriceBreakdown {
  if (
    !Number.isInteger(baseFareAmountCents) ||
    baseFareAmountCents <= 0
  ) {
    throw new Error('Tarifa-base inválida para preço no Pix.');
  }
  if (
    !Number.isInteger(pixPriceAdjustmentBps) ||
    pixPriceAdjustmentBps < 0 ||
    pixPriceAdjustmentBps > MAX_PIX_PRICE_ADJUSTMENT_BPS
  ) {
    throw new Error('Percentual de ajuste do Pix inválido.');
  }

  if (pixPriceAdjustmentBps === 0) {
    return {
      baseFareAmountCents,
      pixPriceAdjustmentBps,
      priceAdjustmentCents: 0,
      totalAmountCents: baseFareAmountCents,
    };
  }

  const denominator = 10_000 - pixPriceAdjustmentBps;
  const totalAmountCents = Math.ceil(
    (baseFareAmountCents * 10_000) / denominator,
  );

  return {
    baseFareAmountCents,
    pixPriceAdjustmentBps,
    priceAdjustmentCents:
      totalAmountCents - baseFareAmountCents,
    totalAmountCents,
  };
}
