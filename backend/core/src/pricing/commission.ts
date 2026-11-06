import { COMMISSION_BPS } from './catalog.v1.js';

export interface CommissionSplit {
  totalAmountCents: number;
  platformCommissionCents: number;
  driverNetCents: number;
}

export function splitCommission(
  totalAmountCents: number,
  commissionBps = COMMISSION_BPS,
): CommissionSplit {
  const platformCommissionCents = Math.round(
    (totalAmountCents * commissionBps) / 10_000,
  );

  return {
    totalAmountCents,
    platformCommissionCents,
    driverNetCents: totalAmountCents - platformCommissionCents,
  };
}
