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

export function rideSettlementLedger(input: {
  rideId: string;
  paymentId: string;
  driverId: string;
  totalAmountCents: number;
  platformCommissionCents: number;
  driverNetCents: number;
  createdAt: string;
}): LedgerTransaction {
  if (
    input.platformCommissionCents + input.driverNetCents !==
    input.totalAmountCents
  ) {
    throw new LedgerError(
      'Liquidação não fecha com o valor total da corrida.',
    );
  }

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
    {
      accountKey: `driver:${input.driverId}:payable`,
      direction: 'credit',
      amountCents: input.driverNetCents,
    },
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

export function passengerWalletCreditLedger(input: {
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
    kind: 'PASSENGER_WALLET_CREDITED',
    referenceKey:
      `wallet-credit:${input.processor}:${input.processorEventId}`,
    entries,
    createdAt: input.createdAt,
  };
}

export function walletRidePaymentLedger(input: {
  passengerId: string;
  rideId: string;
  paymentId: string;
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
    kind: 'RIDE_PAID_WITH_WALLET',
    rideId: input.rideId,
    paymentId: input.paymentId,
    referenceKey: `wallet-payment:${input.paymentId}`,
    entries,
    createdAt: input.createdAt,
  };
}
