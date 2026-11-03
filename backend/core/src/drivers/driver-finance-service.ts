import type { FinanceRepository } from '../payments/finance-repository.js';
import { requestDriverPayout } from '../payments/request-payout.js';
import { anticipationPolicy, PayoutDomainError } from '../payments/payout.js';

export const DRIVER_ANTICIPATION_MINIMUM_CENTS = 8_000;
export const DRIVER_ANTICIPATION_FEE_CENTS = 1_000;

export interface DriverFinanceSummary {
  availableBalanceCents: number;
  payoutPendingCents: number;
  cashCommissionDebtCents: number;
  anticipationMinimumCents: number;
  anticipationFeeCents: number;
}

export async function driverFinanceSummary(
  repository: FinanceRepository,
  driverId: string,
): Promise<DriverFinanceSummary> {
  const policy = anticipationPolicy(await repository.getDriverPayoutSettings());
  return {
    ...policy,
    availableBalanceCents: await repository.getAccountBalanceCents(
      `driver:${driverId}:payable`,
    ),
    payoutPendingCents: await repository.getAccountBalanceCents(
      `driver:${driverId}:payout_pending`,
    ),
    cashCommissionDebtCents:
      await repository.getDriverCashDebtCents(driverId),
  };
}

function maskPixKey(type: string, key: string): string {
  if (type === 'email') {
    const [user, domain] = key.split('@');
    if (!user || !domain) return '••••';
    const visible = user.substring(0, Math.min(2, user.length));
    return `${visible}••••@${domain}`;
  }
  if (type === 'phone') {
    return key.length > 4
      ? `••••••${key.substring(key.length - 4)}`
      : '••••';
  }
  const visible = key.substring(Math.max(0, key.length - 4));
  return `••••${visible}`;
}

export async function driverPayoutDestinationForApp(
  repository: FinanceRepository,
  driverId: string,
) {
  const destination =
    await repository.getDriverPayoutDestination(driverId);
  if (destination == null) {
    return { configured: false as const };
  }
  return {
    configured: true as const,
    pixKeyType: destination.pixKeyType,
    pixKeyMasked: maskPixKey(
      destination.pixKeyType,
      destination.pixKey,
    ),
    updatedAt: destination.updatedAt,
  };
}

export async function saveDriverPayoutDestinationFromApp(input: {
  repository: FinanceRepository;
  driverId: string;
  pixKeyType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  pixKey: string;
  now?: Date;
}) {
  const current =
    await input.repository.getDriverPayoutDestination(input.driverId);
  const instant = (input.now ?? new Date()).toISOString();
  const destination =
    await input.repository.upsertDriverPayoutDestination({
      driverId: input.driverId,
      pixKeyType: input.pixKeyType,
      pixKey: input.pixKey,
      createdAt: current?.createdAt ?? instant,
      updatedAt: instant,
    });
  return {
    configured: true as const,
    pixKeyType: destination.pixKeyType,
    pixKeyMasked: maskPixKey(
      destination.pixKeyType,
      destination.pixKey,
    ),
    updatedAt: destination.updatedAt,
  };
}

export async function requestDriverPayoutFromApp(input: {
  repository: FinanceRepository;
  driverId: string;
  amountCents: number;
  idempotencyKey: string;
  expectedFeeCents?: number;
  expectedMinimumCents?: number;
}) {
  const existing = await input.repository.findDriverPayoutByIdempotencyKey(input.idempotencyKey.trim());
  if (existing) {
    if (existing.driverId !== input.driverId || existing.payoutKind !== 'anticipation' || existing.requestedAmountCents !== input.amountCents) {
      throw new PayoutDomainError('PAYOUT_IDEMPOTENCY_CONFLICT', 'A solicitação já existe com outros dados.');
    }
    return { payout: existing, duplicateRequest: true, finance: await driverFinanceSummary(input.repository, input.driverId) };
  }
  const policy = anticipationPolicy(await input.repository.getDriverPayoutSettings());
  if ((input.expectedFeeCents ?? 1000) !== policy.anticipationFeeCents || (input.expectedMinimumCents ?? 8000) !== policy.anticipationMinimumCents) {
    throw new PayoutDomainError('PAYOUT_POLICY_CHANGED', 'As condições da antecipação mudaram. Atualize a carteira e confirme os novos valores.');
  }
  if (input.amountCents < policy.anticipationMinimumCents) {
    throw new PayoutDomainError(
      'PAYOUT_ANTICIPATION_MINIMUM',
      `A antecipação mínima é de R$ ${(policy.anticipationMinimumCents / 100).toFixed(2).replace('.', ',')}.`,
    );
  }

  const netAmountCents =
    input.amountCents - policy.anticipationFeeCents;
  const result = await requestDriverPayout(input.repository, {
    driverId: input.driverId,
    amountCents: netAmountCents,
    requestedAmountCents: input.amountCents,
    feeCents: policy.anticipationFeeCents,
    payoutKind: 'anticipation',
    executionMode: 'manual',
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


function accountDeltaCents(
  transaction: Awaited<
    ReturnType<FinanceRepository['listLedgerTransactionsForAccounts']>
  >[number],
  accountKey: string,
): number {
  return transaction.entries
    .filter((entry) => entry.accountKey === accountKey)
    .reduce(
      (sum, entry) =>
        sum +
        (entry.direction === 'credit'
          ? entry.amountCents
          : -entry.amountCents),
      0,
    );
}

function transactionLabel(kind: string): string {
  switch (kind) {
    case 'OCCURRENCE_BONUS':
      return 'Bônus de ocorrência';
    case 'RIDE_CANCELLATION_FEE':
      return 'Taxa de cancelamento';
    case 'RIDE_SETTLED':
      return 'Corrida concluída';
    case 'CASH_RIDE_COMMISSION_ACCRUED':
      return 'Taxa de corrida em dinheiro';
    case 'DRIVER_PAYOUT_RESERVED':
      return 'Saque solicitado';
    default:
      return 'Movimentação financeira';
  }
}

export async function driverFinanceStatement(input: {
  repository: FinanceRepository;
  driverId: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(100, input.limit ?? 50));
  const payableAccount = `driver:${input.driverId}:payable`;
  const payoutPendingAccount =
    `driver:${input.driverId}:payout_pending`;
  const debtAccount =
    `driver:${input.driverId}:commission_debt`;

  const [finance, transactions] = await Promise.all([
    driverFinanceSummary(input.repository, input.driverId),
    input.repository.listLedgerTransactionsForAccounts(
      [payableAccount, payoutPendingAccount, debtAccount],
      limit,
    ),
  ]);

  let runningAvailableBalanceCents =
    finance.availableBalanceCents;

  const items = transactions.map((transaction) => {
    const availableDeltaCents = accountDeltaCents(
      transaction,
      payableAccount,
    );
    const pendingDeltaCents = accountDeltaCents(
      transaction,
      payoutPendingAccount,
    );
    const debtLedgerDeltaCents = accountDeltaCents(
      transaction,
      debtAccount,
    );

    const platformFeeCents = transaction.entries
      .filter((entry) => entry.accountKey === 'platform:revenue')
      .reduce(
        (sum, entry) =>
          sum +
          (entry.direction === 'credit'
            ? entry.amountCents
            : -entry.amountCents),
        0,
      );

    const balanceAfterCents = runningAvailableBalanceCents;
    runningAvailableBalanceCents -= availableDeltaCents;

    return {
      id: transaction.id,
      kind: transaction.kind,
      title: transactionLabel(transaction.kind),
      ...(transaction.rideId == null
        ? {}
        : { rideId: transaction.rideId }),
      ...(transaction.payoutId == null
        ? {}
        : { payoutId: transaction.payoutId }),
      availableDeltaCents,
      pendingDeltaCents,
      debtDeltaCents: -debtLedgerDeltaCents,
      platformFeeCents: Math.max(0, platformFeeCents),
      balanceAfterCents,
      createdAt: transaction.createdAt,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    finance,
    items,
  };
}
