import type { PricePeriod } from './types.js';

export const RAMO_OPERATION_TIME_ZONE = 'America/Fortaleza';

const hourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: RAMO_OPERATION_TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23',
});

export function pricingPeriodAt(instant: Date = new Date()): PricePeriod {
  if (Number.isNaN(instant.getTime())) {
    throw new Error('Instante inválido para determinar período tarifário.');
  }

  const hour = Number(hourFormatter.format(instant));
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('Não foi possível determinar o horário tarifário.');
  }

  return hour >= 22 || hour < 6 ? 'after_22' : 'day';
}
