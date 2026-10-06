import type { PricePeriod } from './types.js';

export const RAMO_OPERATION_TIME_ZONE = 'America/Fortaleza';

const hourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: RAMO_OPERATION_TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23',
});

export interface PricingPeriodPolicy {
  nightStartHour: number;
  dayStartHour: number;
}

export const DEFAULT_PRICING_PERIOD_POLICY: PricingPeriodPolicy = {
  nightStartHour: 22,
  dayStartHour: 6,
};

function validatePeriodPolicy(
  policy: PricingPeriodPolicy,
): PricingPeriodPolicy {
  const nightStartHour = Number(policy.nightStartHour);
  const dayStartHour = Number(policy.dayStartHour);
  if (
    !Number.isInteger(nightStartHour) ||
    !Number.isInteger(dayStartHour) ||
    nightStartHour < 0 ||
    nightStartHour > 23 ||
    dayStartHour < 0 ||
    dayStartHour > 23 ||
    nightStartHour === dayStartHour
  ) {
    throw new Error('Política de horário tarifário inválida.');
  }

  return { nightStartHour, dayStartHour };
}

export function pricingPeriodAt(
  instant: Date = new Date(),
  policy: PricingPeriodPolicy = DEFAULT_PRICING_PERIOD_POLICY,
): PricePeriod {
  if (Number.isNaN(instant.getTime())) {
    throw new Error('Instante inválido para determinar período tarifário.');
  }

  const hour = Number(hourFormatter.format(instant));
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('Não foi possível determinar o horário tarifário.');
  }

  const normalized = validatePeriodPolicy(policy);
  const overnight =
    normalized.nightStartHour > normalized.dayStartHour;
  const isNight = overnight
    ? hour >= normalized.nightStartHour ||
      hour < normalized.dayStartHour
    : hour >= normalized.nightStartHour &&
      hour < normalized.dayStartHour;

  return isNight ? 'after_22' : 'day';
}
