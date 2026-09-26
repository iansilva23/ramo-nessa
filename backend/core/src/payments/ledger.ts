import { randomUUID } from 'node:crypto';

export type LedgerDirection = 'debit' | 'credit';

export interface LedgerEntry {
  accountKey: string;
  direction: LedgerDirection;
  amountCents: number;
}

export interface LedgerTransaction {
  id: string;
  kind: string;
  rideId?: string;
  paymentId?: string;
  payoutId?: string;
  walletTopupId?: string;
  referenceKey: string;
  entries: LedgerEntry[];
  createdAt: string;
}

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

export function assertBalanced(entries: readonly LedgerEntry[]): void {
  if (entries.length < 2) {
    throw new LedgerError('Lançamento precisa de pelo menos duas entradas.');
  }

  let debits = 0;
  let credits = 0;

  for (const entry of entries) {
    if (!Number.isInteger(entry.amountCents) || entry.amountCents <= 0) {
      throw new LedgerError('Valor do ledger deve ser inteiro positivo.');
    }

    if (entry.direction === 'debit') {
      debits += entry.amountCents;
    } else {
      credits += entry.amountCents;
    }
  }

  if (debits !== credits) {
    throw new LedgerError(
      `Ledger desbalanceado: débitos=${debits}, créditos=${credits}.`,
    );
  }
}

export function paymentCaptureLedger(input: {
  rideId: string;
  paymentId: string;
  processor: string;
  processorEventId: string;
  amountCents: number;
  createdAt: string;
}): LedgerTransaction {
  const entries: LedgerEntry[] = [
    {
      accountKey: `processor:${input.processor}:clearing`,
      direction: 'debit',
      amountCents: input.amountCents,
    },
    {
      accountKey: `ride:${input.rideId}:escrow`,
      direction: 'credit',
      amountCents: input.amountCents,
    },
  ];

  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'PAYMENT_CAPTURED',
    rideId: input.rideId,
    paymentId: input.paymentId,
    referenceKey:
      `payment-capture:${input.processor}:${input.processorEventId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function externalRideRefundLedger(input: {
  rideId: string;
  paymentId: string;
  processor: string;
  amountCents: number;
  createdAt: string;
}): LedgerTransaction {
  const entries: LedgerEntry[] = [
    {
      accountKey: `ride:${input.rideId}:escrow`,
      direction: 'debit',
      amountCents: input.amountCents,
    },
    {
      accountKey: `processor:${input.processor}:clearing`,
      direction: 'credit',
      amountCents: input.amountCents,
    },
  ];

  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'EXTERNAL_RIDE_REFUNDED',
    rideId: input.rideId,
    paymentId: input.paymentId,
    referenceKey: `external-ride-refund:${input.paymentId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function walletTopupCaptureLedger(input: {
  walletTopupId: string;
  passengerId: string;
  processor: string;
  processorEventId: string;
  amountCents: number;
  createdAt: string;
}): LedgerTransaction {
  const entries: LedgerEntry[] = [
    {
      accountKey: `processor:${input.processor}:clearing`,
      direction: 'debit',
      amountCents: input.amountCents,
    },
    {
      accountKey: `passenger:${input.passengerId}:wallet`,
      direction: 'credit',
      amountCents: input.amountCents,
    },
  ];

  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'WALLET_TOPUP_CAPTURED',
    walletTopupId: input.walletTopupId,
    referenceKey:
      `wallet-topup-capture:${input.processor}:${input.processorEventId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function walletRidePaymentLedger(input: {
  rideId: string;
  paymentId: string;
  passengerId: string;
  amountCents: number;
  createdAt: string;
}): LedgerTransaction {
  const entries: LedgerEntry[] = [
    {
      accountKey: `passenger:${input.passengerId}:wallet`,
      direction: 'debit',
      amountCents: input.amountCents,
    },
    {
      accountKey: `ride:${input.rideId}:escrow`,
      direction: 'credit',
      amountCents: input.amountCents,
    },
  ];

  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'WALLET_RIDE_PAYMENT',
    rideId: input.rideId,
    paymentId: input.paymentId,
    referenceKey: `wallet-ride-payment:${input.paymentId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function walletRideRefundLedger(input: {
  rideId: string;
  paymentId: string;
  passengerId: string;
  amountCents: number;
  createdAt: string;
}): LedgerTransaction {
  const entries: LedgerEntry[] = [
    {
      accountKey: `ride:${input.rideId}:escrow`,
      direction: 'debit',
      amountCents: input.amountCents,
    },
    {
      accountKey: `passenger:${input.passengerId}:wallet`,
      direction: 'credit',
      amountCents: input.amountCents,
    },
  ];

  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'WALLET_RIDE_REFUNDED',
    rideId: input.rideId,
    paymentId: input.paymentId,
    referenceKey: `wallet-ride-refund:${input.paymentId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function rideSettlementLedger(input: {
  rideId: string;
  paymentId: string;
  driverId: string;
  totalAmountCents: number;
  fareAmountCents: number;
  paymentAdjustmentCents: number;
  platformCommissionCents: number;
  driverNetCents: number;
  cashDebtRecoveryCents?: number;
  createdAt: string;
}): LedgerTransaction {
  if (
    input.platformCommissionCents + input.driverNetCents !==
    input.fareAmountCents ||
    input.fareAmountCents + input.paymentAdjustmentCents !==
      input.totalAmountCents ||
    !Number.isInteger(input.paymentAdjustmentCents) ||
    input.paymentAdjustmentCents < 0
  ) {
    throw new LedgerError(
      'Liquidação não fecha entre tarifa-base, ajuste de pagamento e total cobrado.',
    );
  }

  const cashDebtRecoveryCents =
    input.cashDebtRecoveryCents ?? 0;
  if (
    !Number.isInteger(cashDebtRecoveryCents) ||
    cashDebtRecoveryCents < 0 ||
    cashDebtRecoveryCents > input.driverNetCents
  ) {
    throw new LedgerError(
      'Recuperação de dívida cash inválida para a liquidação.',
    );
  }

  const driverPayableCents =
    input.driverNetCents - cashDebtRecoveryCents;
  const entries: LedgerEntry[] = [
    {
      accountKey: `ride:${input.rideId}:escrow`,
      direction: 'debit',
      amountCents: input.totalAmountCents,
    },
    {
      accountKey: 'platform:revenue',
      direction: 'credit',
      amountCents: input.platformCommissionCents,
    },
    ...(input.paymentAdjustmentCents > 0
      ? [
          {
            accountKey: 'platform:payment_fee_recovery',
            direction: 'credit' as const,
            amountCents: input.paymentAdjustmentCents,
          },
        ]
      : []),
    ...(cashDebtRecoveryCents > 0
      ? [
          {
            accountKey:
              `driver:${input.driverId}:commission_debt`,
            direction: 'credit' as const,
            amountCents: cashDebtRecoveryCents,
          },
        ]
      : []),
    ...(driverPayableCents > 0
      ? [
          {
            accountKey: `driver:${input.driverId}:payable`,
            direction: 'credit' as const,
            amountCents: driverPayableCents,
          },
        ]
      : []),
  ];

  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'RIDE_SETTLED',
    rideId: input.rideId,
    paymentId: input.paymentId,
    referenceKey: `ride-settlement:${input.rideId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function cashRideCommissionDebtLedger(input: {
  rideId: string;
  driverId: string;
  platformCommissionCents: number;
  existingDebtCents?: number;
  availableDriverPayableCents?: number;
  createdAt: string;
}): LedgerTransaction {
  if (
    !Number.isInteger(input.platformCommissionCents) ||
    input.platformCommissionCents <= 0
  ) {
    throw new LedgerError(
      'Comissão cash precisa ser um inteiro positivo.',
    );
  }

  const existingDebtCents = input.existingDebtCents ?? 0;
  const availableDriverPayableCents =
    input.availableDriverPayableCents ?? 0;
  if (
    !Number.isInteger(existingDebtCents) ||
    existingDebtCents < 0 ||
    !Number.isInteger(availableDriverPayableCents) ||
    availableDriverPayableCents < 0
  ) {
    throw new LedgerError(
      'Saldos usados na liquidação cash são inválidos.',
    );
  }

  const totalObligationCents =
    existingDebtCents + input.platformCommissionCents;
  const payableRecoveryCents = Math.min(
    availableDriverPayableCents,
    totalObligationCents,
  );
  const priorDebtRecoveryCents = Math.min(
    existingDebtCents,
    payableRecoveryCents,
  );
  const newCommissionRecoveryCents =
    payableRecoveryCents - priorDebtRecoveryCents;
  const newDebtCents =
    input.platformCommissionCents - newCommissionRecoveryCents;

  const entries: LedgerEntry[] = [
    ...(payableRecoveryCents > 0
      ? [{
          accountKey: `driver:${input.driverId}:payable`,
          direction: 'debit' as const,
          amountCents: payableRecoveryCents,
        }]
      : []),
    ...(priorDebtRecoveryCents > 0
      ? [{
          accountKey:
            `driver:${input.driverId}:commission_debt`,
          direction: 'credit' as const,
          amountCents: priorDebtRecoveryCents,
        }]
      : []),
    ...(newDebtCents > 0
      ? [{
          accountKey:
            `driver:${input.driverId}:commission_debt`,
          direction: 'debit' as const,
          amountCents: newDebtCents,
        }]
      : []),
    {
      accountKey: 'platform:revenue',
      direction: 'credit',
      amountCents: input.platformCommissionCents,
    },
  ];

  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'CASH_RIDE_COMMISSION_ACCRUED',
    rideId: input.rideId,
    referenceKey: `cash-ride-commission:${input.rideId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function driverPayoutReserveLedger(input: {
  payoutId: string;
  driverId: string;
  amountCents: number;
  createdAt: string;
}): LedgerTransaction {
  const entries: LedgerEntry[] = [
    {
      accountKey: `driver:${input.driverId}:payable`,
      direction: 'debit',
      amountCents: input.amountCents,
    },
    {
      accountKey: `driver:${input.driverId}:payout_pending`,
      direction: 'credit',
      amountCents: input.amountCents,
    },
  ];

  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'DRIVER_PAYOUT_RESERVED',
    payoutId: input.payoutId,
    referenceKey: `driver-payout-reserve:${input.payoutId}`,
    entries,
    createdAt: input.createdAt,
  };
}
