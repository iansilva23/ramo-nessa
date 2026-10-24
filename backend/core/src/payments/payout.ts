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

export type DriverPayoutMode = 'manual' | 'semi_automatic' | 'automatic';

export interface DriverPayoutRecord {
  /** Immutable payment channel; manual reservations must never reach a provider. */
  executionMode?: 'manual' | 'api';
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
  anticipationMinimumCents?: number;
  anticipationFeeCents?: number;
  mode?: DriverPayoutMode;
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
      | 'PAYOUT_MANUAL_ONLY'
      | 'PAYOUT_APPROVAL_REQUIRED'
      | 'PAYOUT_ANTICIPATION_MINIMUM'
      | 'PAYOUT_POLICY_CHANGED',
    message: string,
  ) {
    super(message);
    this.name = 'PayoutDomainError';
  }
}

export function anticipationPolicy(settings: { anticipationMinimumCents?: number | undefined; anticipationFeeCents?: number | undefined }) {
  const minimum = settings.anticipationMinimumCents ?? 8000;
  const fee = settings.anticipationFeeCents ?? 1000;
  if (!Number.isSafeInteger(minimum) || minimum < 1 || minimum > 100000000 ||
      !Number.isSafeInteger(fee) || fee < 0 || fee >= minimum) {
    throw new PayoutDomainError('INVALID_PAYOUT_AMOUNT', 'Informe mínimo de antecipação positivo e taxa menor que o mínimo, em centavos.');
  }
  return { anticipationMinimumCents: minimum, anticipationFeeCents: fee };
}
