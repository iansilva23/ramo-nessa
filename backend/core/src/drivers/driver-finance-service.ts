import type { FinanceRepository } from '../payments/finance-repository.js';
import { requestDriverPayout } from '../payments/request-payout.js';

export interface DriverFinanceSummary {
  availableBalanceCents: number;
  payoutPendingCents: number;
}

export async function driverFinanceSummary(
  repository: FinanceRepository,
  driverId: string,
): Promise<DriverFinanceSummary> {
  return {
    availableBalanceCents: await repository.getAccountBalanceCents(
      `driver:${driverId}:payable`,
    ),
    payoutPendingCents: await repository.getAccountBalanceCents(
      `driver:${driverId}:payout_pending`,
    ),
  };
}

export async function requestDriverPayoutFromApp(input: {
  repository: FinanceRepository;
  driverId: string;
  amountCents: number;
  idempotencyKey: string;
}) {
  const result = await requestDriverPayout(input.repository, {
    driverId: input.driverId,
    amountCents: input.amountCents,
    idempotencyKey: input.idempotencyKey,
  });

  return {
    payout: result.payout,
    duplicateRequest: result.duplicateRequest,
    finance: await driverFinanceSummary(
      input.repository,
      input.driverId,
    ),
  };
}
