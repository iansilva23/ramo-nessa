import type { EnabledPaymentMethod } from './payment-policy.js';

export type PaymentStatus =
  | 'created'
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export interface PaymentSnapshot {
  paymentId: string;
  quoteRuleId: string;
  method: EnabledPaymentMethod;
  amountCents: number;
  status: PaymentStatus;
  idempotencyKey: string;
}

export class PaymentStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentStateError';
  }
}

const ALLOWED_PAYMENT_TRANSITIONS: Readonly<
  Record<PaymentStatus, ReadonlySet<PaymentStatus>>
> = {
  created: new Set(['pending', 'cancelled']),
  pending: new Set(['authorized', 'paid', 'failed', 'cancelled']),
  authorized: new Set(['paid', 'cancelled']),
  paid: new Set(['refunded']),
  failed: new Set([]),
  cancelled: new Set([]),
  refunded: new Set([]),
};

export function canDispatchWithPayment(status: PaymentStatus): boolean {
  return status === 'authorized' || status === 'paid';
}

export function transitionPayment(
  current: PaymentStatus,
  next: PaymentStatus,
): PaymentStatus {
  if (!ALLOWED_PAYMENT_TRANSITIONS[current].has(next)) {
    throw new PaymentStateError(
      `Transição de pagamento inválida: ${current} -> ${next}.`,
    );
  }

  return next;
}

export function assertPaymentReadyForDispatch(
  payment: Pick<PaymentSnapshot, 'status' | 'amountCents'>,
): void {
  if (payment.amountCents <= 0) {
    throw new PaymentStateError('Pagamento precisa ter valor positivo.');
  }

  if (!canDispatchWithPayment(payment.status)) {
    throw new PaymentStateError(
      'Pagamento ainda não autoriza despacho para motorista.',
    );
  }
}
