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
  companyPayoutId?: string;
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
  escrowAppliedCents?: number;
  reviewRequiredCents?: number;
  createdAt: string;
}): LedgerTransaction {
  const escrowAppliedCents =
    input.escrowAppliedCents ?? input.amountCents;
  const reviewRequiredCents =
    input.reviewRequiredCents ?? 0;
  if (
    !Number.isInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    !Number.isInteger(escrowAppliedCents) ||
    escrowAppliedCents < 0 ||
    !Number.isInteger(reviewRequiredCents) ||
    reviewRequiredCents < 0 ||
    escrowAppliedCents + reviewRequiredCents !== input.amountCents
  ) {
    throw new LedgerError(
      'Distribuição do estorno externo não fecha com o valor restante.',
    );
  }

  const entries: LedgerEntry[] = [
    ...(escrowAppliedCents > 0
      ? [{
          accountKey: `ride:${input.rideId}:escrow`,
          direction: 'debit' as const,
          amountCents: escrowAppliedCents,
        }]
      : []),
    ...(reviewRequiredCents > 0
      ? [{
          accountKey: 'platform:external_adjustment_review',
          direction: 'debit' as const,
          amountCents: reviewRequiredCents,
        }]
      : []),
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

export function externalPaymentAdjustmentLedger(input: {
  rideId: string;
  paymentId: string;
  processor: string;
  processorAdjustmentId: string;
  escrowAppliedCents: number;
  reviewRequiredCents: number;
  createdAt: string;
}): LedgerTransaction {
  const totalCents =
    input.escrowAppliedCents + input.reviewRequiredCents;
  if (
    !Number.isInteger(input.escrowAppliedCents) ||
    input.escrowAppliedCents < 0 ||
    !Number.isInteger(input.reviewRequiredCents) ||
    input.reviewRequiredCents < 0 ||
    totalCents <= 0
  ) {
    throw new LedgerError(
      'Ajuste externo precisa ter valor positivo.',
    );
  }

  const entries: LedgerEntry[] = [
    ...(input.escrowAppliedCents > 0
      ? [{
          accountKey: `ride:${input.rideId}:escrow`,
          direction: 'debit' as const,
          amountCents: input.escrowAppliedCents,
        }]
      : []),
    ...(input.reviewRequiredCents > 0
      ? [{
          accountKey: 'platform:external_adjustment_review',
          direction: 'debit' as const,
          amountCents: input.reviewRequiredCents,
        }]
      : []),
    {
      accountKey: `processor:${input.processor}:clearing`,
      direction: 'credit',
      amountCents: totalCents,
    },
  ];

  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'EXTERNAL_PAYMENT_ADJUSTMENT',
    rideId: input.rideId,
    paymentId: input.paymentId,
    referenceKey:
      `external-adjustment:${input.processor}:${input.processorAdjustmentId}`,
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

export function walletTopupRefundLedger(input: {
  walletTopupId: string;
  passengerId: string;
  processor: string;
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
      accountKey: `processor:${input.processor}:clearing`,
      direction: 'credit',
      amountCents: input.amountCents,
    },
  ];

  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'WALLET_TOPUP_REFUNDED',
    walletTopupId: input.walletTopupId,
    referenceKey: `wallet-topup-refund:${input.walletTopupId}`,
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

export function ridePromotionFundingLedger(input: {
  rideId: string;
  applicationId: string;
  amountCents: number;
  createdAt: string;
}): LedgerTransaction {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new LedgerError('Subsídio promocional precisa ser positivo.');
  }
  const entries: LedgerEntry[] = [
    {
      accountKey: 'platform:promotion_expense',
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
    kind: 'RIDE_PROMOTION_FUNDED',
    rideId: input.rideId,
    referenceKey: `ride-promotion:${input.applicationId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function walletPromotionGrantLedger(input: {
  passengerId: string;
  applicationId: string;
  amountCents: number;
  createdAt: string;
}): LedgerTransaction {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new LedgerError('Crédito promocional precisa ser positivo.');
  }
  const entries: LedgerEntry[] = [
    {
      accountKey: 'platform:promotion_expense',
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
    kind: 'WALLET_PROMOTION_GRANTED',
    referenceKey: `wallet-promotion:${input.applicationId}`,
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


export function driverPayoutAnticipationFeeLedger(input: {
  payoutId: string;
  driverId: string;
  feeCents: number;
  createdAt: string;
}): LedgerTransaction {
  if (!Number.isInteger(input.feeCents) || input.feeCents <= 0) {
    throw new LedgerError('Taxa de antecipação deve ser positiva.');
  }
  const entries: LedgerEntry[] = [
    {
      accountKey: `driver:${input.driverId}:payout_pending`,
      direction: 'debit',
      amountCents: input.feeCents,
    },
    {
      accountKey: 'platform:revenue',
      direction: 'credit',
      amountCents: input.feeCents,
    },
  ];
  assertBalanced(entries);
  return {
    id: randomUUID(),
    kind: 'DRIVER_PAYOUT_ANTICIPATION_FEE',
    payoutId: input.payoutId,
    referenceKey: `driver-payout-anticipation-fee:${input.payoutId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function driverPayoutPaidLedger(input: {
  payoutId: string;
  driverId: string;
  processor: string;
  amountCents: number;
  createdAt: string;
}): LedgerTransaction {
  const processor = input.processor.trim();
  if (processor.length < 2) {
    throw new LedgerError('Processador do saque é obrigatório.');
  }

  const entries: LedgerEntry[] = [
    {
      accountKey: `driver:${input.driverId}:payout_pending`,
      direction: 'debit',
      amountCents: input.amountCents,
    },
    {
      accountKey: `processor:${processor}:payouts`,
      direction: 'credit',
      amountCents: input.amountCents,
    },
  ];

  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'DRIVER_PAYOUT_PAID',
    payoutId: input.payoutId,
    referenceKey: `driver-payout-paid:${input.payoutId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function driverPayoutFailedLedger(input: {
  payoutId: string;
  driverId: string;
  amountCents: number;
  requestedAmountCents?: number;
  feeCents?: number;
  feeWasApplied?: boolean;
  createdAt: string;
}): LedgerTransaction {
  const gross = input.requestedAmountCents ?? input.amountCents;
  const fee = input.feeCents ?? 0;
  const charged = input.feeWasApplied === true && fee > 0;
  const entries: LedgerEntry[] = [
    {
      accountKey: `driver:${input.driverId}:payout_pending`,
      direction: 'debit',
      amountCents: charged ? input.amountCents : gross,
    },
    ...(charged
      ? [{
          accountKey: 'platform:revenue',
          direction: 'debit' as const,
          amountCents: fee,
        }]
      : []),
    {
      accountKey: `driver:${input.driverId}:payable`,
      direction: 'credit',
      amountCents: gross,
    },
  ];
  assertBalanced(entries);
  return {
    id: randomUUID(),
    kind: 'DRIVER_PAYOUT_FAILED',
    payoutId: input.payoutId,
    referenceKey: `driver-payout-failed:${input.payoutId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function driverPayoutCancelledLedger(input: {
  payoutId: string;
  driverId: string;
  amountCents: number;
  requestedAmountCents?: number;
  feeCents?: number;
  feeWasApplied?: boolean;
  createdAt: string;
}): LedgerTransaction {
  const gross = input.requestedAmountCents ?? input.amountCents;
  const fee = input.feeCents ?? 0;
  const charged = input.feeWasApplied === true && fee > 0;
  const entries: LedgerEntry[] = [
    {
      accountKey: `driver:${input.driverId}:payout_pending`,
      direction: 'debit',
      amountCents: charged ? input.amountCents : gross,
    },
    ...(charged
      ? [{
          accountKey: 'platform:revenue',
          direction: 'debit' as const,
          amountCents: fee,
        }]
      : []),
    {
      accountKey: `driver:${input.driverId}:payable`,
      direction: 'credit',
      amountCents: gross,
    },
  ];
  assertBalanced(entries);
  return {
    id: randomUUID(),
    kind: 'DRIVER_PAYOUT_CANCELLED',
    payoutId: input.payoutId,
    referenceKey: `driver-payout-cancelled:${input.payoutId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function companyPayoutReserveLedger(input: {
  companyPayoutId: string;
  amountCents: number;
  createdAt: string;
}): LedgerTransaction {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new LedgerError('Valor do repasse da empresa deve ser positivo.');
  }

  const entries: LedgerEntry[] = [
    {
      accountKey: 'platform:revenue',
      direction: 'debit',
      amountCents: input.amountCents,
    },
    {
      accountKey: 'platform:company_payout_pending',
      direction: 'credit',
      amountCents: input.amountCents,
    },
  ];
  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'COMPANY_PAYOUT_RESERVED',
    companyPayoutId: input.companyPayoutId,
    referenceKey: `company-payout-reserve:${input.companyPayoutId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function companyPayoutPaidLedger(input: {
  companyPayoutId: string;
  processor: string;
  amountCents: number;
  createdAt: string;
}): LedgerTransaction {
  const processor = input.processor.trim();
  if (processor.length < 2) {
    throw new LedgerError('Processador do repasse da empresa é obrigatório.');
  }

  const entries: LedgerEntry[] = [
    {
      accountKey: 'platform:company_payout_pending',
      direction: 'debit',
      amountCents: input.amountCents,
    },
    {
      accountKey: `processor:${processor}:payouts`,
      direction: 'credit',
      amountCents: input.amountCents,
    },
  ];
  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'COMPANY_PAYOUT_PAID',
    companyPayoutId: input.companyPayoutId,
    referenceKey: `company-payout-paid:${input.companyPayoutId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function companyPayoutFailedLedger(input: {
  companyPayoutId: string;
  amountCents: number;
  createdAt: string;
}): LedgerTransaction {
  const entries: LedgerEntry[] = [
    {
      accountKey: 'platform:company_payout_pending',
      direction: 'debit',
      amountCents: input.amountCents,
    },
    {
      accountKey: 'platform:revenue',
      direction: 'credit',
      amountCents: input.amountCents,
    },
  ];
  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'COMPANY_PAYOUT_FAILED',
    companyPayoutId: input.companyPayoutId,
    referenceKey: `company-payout-failed:${input.companyPayoutId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function companyPayoutCancelledLedger(input: {
  companyPayoutId: string;
  amountCents: number;
  createdAt: string;
}): LedgerTransaction {
  const entries: LedgerEntry[] = [
    {
      accountKey: 'platform:company_payout_pending',
      direction: 'debit',
      amountCents: input.amountCents,
    },
    {
      accountKey: 'platform:revenue',
      direction: 'credit',
      amountCents: input.amountCents,
    },
  ];
  assertBalanced(entries);

  return {
    id: randomUUID(),
    kind: 'COMPANY_PAYOUT_CANCELLED',
    companyPayoutId: input.companyPayoutId,
    referenceKey: `company-payout-cancelled:${input.companyPayoutId}`,
    entries,
    createdAt: input.createdAt,
  };
}

