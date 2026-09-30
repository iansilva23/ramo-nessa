export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

export type DriverPayoutKind =
  | 'legacy'
  | 'anticipation'
  | 'scheduled'
  | 'manual';

export interface DriverPayoutDestination {
  driverId: string;
  pixKeyType: PixKeyType;
  pixKey: string;
  createdAt: string;
  updatedAt: string;
}

export type DriverPayoutStatus =
  | 'requested'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'cancelled';

export interface DriverPayoutRecord {
  id: string;
  driverId: string;
  /** Valor líquido enviado ao destino Pix. */
  amountCents: number;
  status: DriverPayoutStatus;
  idempotencyKey: string;
  pixKeyType: PixKeyType;
  pixKey: string;
  payoutKind?: DriverPayoutKind;
  /** Valor bruto reservado do saldo do motorista. */
  requestedAmountCents?: number;
  feeCents?: number;
  approvedAt?: string;
  processor?: string;
  processorPayoutId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriverPayoutSettings {
  automaticEnabled: boolean;
  updatedAt: string;
}

export function payoutKind(payout: DriverPayoutRecord): DriverPayoutKind {
  return payout.payoutKind ?? 'legacy';
}

export function payoutRequestedAmountCents(
  payout: DriverPayoutRecord,
): number {
  return payout.requestedAmountCents ?? payout.amountCents;
}

export function payoutFeeCents(payout: DriverPayoutRecord): number {
  return payout.feeCents ?? 0;
}

export function payoutRequiresAdminApproval(
  payout: DriverPayoutRecord,
): boolean {
  return payoutKind(payout) === 'anticipation' && payout.approvedAt == null;
}

export class PayoutDomainError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_PAYOUT_AMOUNT'
      | 'INVALID_DRIVER'
      | 'INVALID_IDEMPOTENCY_KEY'
      | 'PAYOUT_IDEMPOTENCY_CONFLICT'
      | 'INSUFFICIENT_DRIVER_BALANCE'
      | 'PAYOUT_DESTINATION_REQUIRED'
      | 'INVALID_PIX_KEY'
      | 'PAYOUT_NOT_FOUND'
      | 'INVALID_PAYOUT_TRANSITION'
      | 'PAYOUT_PROCESSOR_REQUIRED'
      | 'PAYOUT_APPROVAL_REQUIRED'
      | 'PAYOUT_ANTICIPATION_MINIMUM',
    message: string,
  ) {
    super(message);
    this.name = 'PayoutDomainError';
  }
}
