import type { AuthIdentityRecord } from '../auth/auth-otp-repository.js';
import { isDriverPaymentHoldExpired, type RideRecord } from '../rides/ride.js';
import { createPaymentForRide } from './create-payment.js';
import type { FinanceRepository } from './finance-repository.js';
import {
  mercadoPagoOrderRefundState,
  type MercadoPagoCardOrder,
  type MercadoPagoOrderStatus,
  type MercadoPagoOrdersClient,
  type MercadoPagoPixOrder,
} from './mercado-pago-orders.js';
import { PaymentDomainError, type PaymentRecord } from './payment.js';
import { cardPriceForBaseFare } from './card-price-adjustment.js';
import { pixPriceForBaseFare } from './pix-price-adjustment.js';

export class MercadoPagoPaymentServiceError extends Error {
  constructor(
    public readonly code:
      | 'MERCADO_PAGO_NOT_CONFIGURED'
      | 'PASSENGER_EMAIL_REQUIRED'
      | 'ORDER_PAYMENT_MISMATCH'
      | 'ORDER_AMOUNT_MISMATCH'
      | 'ORDER_REFERENCE_MISMATCH'
      | 'ORDER_STATUS_UNSUPPORTED',
    message: string,
  ) {
    super(message);
    this.name = 'MercadoPagoPaymentServiceError';
  }
}

export interface MercadoPagoPixIntent {
  payment: PaymentRecord;
  pix: MercadoPagoPixOrder;
  pricing: ReturnType<typeof pixPriceForBaseFare>;
}

export function shouldRefundMercadoPagoPaymentBeforeDispatch(
  ride: RideRecord,
  now: Date,
): boolean {
  return (
    ride.state === 'AWAITING_PAYMENT' &&
    isDriverPaymentHoldExpired(ride, now)
  );
}

export async function createMercadoPagoPixIntent(input: {
  finance: FinanceRepository;
  gateway: MercadoPagoOrdersClient | null;
  ride: RideRecord;
  identity: AuthIdentityRecord | null;
  payerEmail?: string;
  pixPriceAdjustmentBps: number;
  idempotencyKey: string;
  now?: Date;
}): Promise<MercadoPagoPixIntent> {
  if (input.gateway == null) {
    throw new MercadoPagoPaymentServiceError(
      'MERCADO_PAGO_NOT_CONFIGURED',
      'Mercado Pago ainda não está configurado neste ambiente.',
    );
  }

  const email =
    input.payerEmail?.trim().toLowerCase() ||
    input.identity?.emailNormalized?.trim();
  if (!email) {
    throw new MercadoPagoPaymentServiceError(
      'PASSENGER_EMAIL_REQUIRED',
      'Informe um e-mail válido para gerar o Pix.',
    );
  }

  const pricing = pixPriceForBaseFare(
    input.ride.quote.totalAmountCents,
    input.pixPriceAdjustmentBps,
  );

  let payment = await createPaymentForRide(input.finance, {
    ride: input.ride,
    method: 'pix',
    processor: 'mercado-pago-orders',
    idempotencyKey: input.idempotencyKey,
    amountCents: pricing.totalAmountCents,
    ...(input.now != null ? { now: input.now } : {}),
  });

  if (
    payment.status === 'paid' ||
    payment.status === 'refunded' ||
    payment.status === 'failed' ||
    payment.status === 'cancelled'
  ) {
    throw new PaymentDomainError(
      'INVALID_PAYMENT_TRANSITION',
      `Pagamento em estado ${payment.status} não pode gerar novo Pix.`,
    );
  }

  const pix = await input.gateway.createPixOrder({
    paymentId: payment.id,
    amountCents: payment.amountCents,
    payerEmail: email,
    idempotencyKey: `mp-pix-${payment.id}`,
  });

  payment = await input.finance.markPaymentPending({
    paymentId: payment.id,
    processorPaymentId: pix.orderId,
    ...(input.now != null ? { pendingAt: input.now } : {}),
  });

  return { payment, pix, pricing };
}

export interface MercadoPagoCardIntent {
  payment: PaymentRecord;
  card: MercadoPagoCardOrder;
  pricing: ReturnType<typeof cardPriceForBaseFare>;
}

export async function createMercadoPagoCardIntent(input: {
  finance: FinanceRepository;
  gateway: MercadoPagoOrdersClient | null;
  ride: RideRecord;
  identity: AuthIdentityRecord | null;
  payerEmail?: string;
  cardToken: string;
  paymentMethodId: string;
  paymentMethodType: 'credit_card' | 'debit_card';
  installments: number;
  cardPriceAdjustmentBps: number;
  idempotencyKey: string;
  now?: Date;
}): Promise<MercadoPagoCardIntent> {
  if (input.gateway == null) {
    throw new MercadoPagoPaymentServiceError(
      'MERCADO_PAGO_NOT_CONFIGURED',
      'Mercado Pago ainda não está configurado neste ambiente.',
    );
  }

  const email =
    input.payerEmail?.trim().toLowerCase() ||
    input.identity?.emailNormalized?.trim();
  if (!email) {
    throw new MercadoPagoPaymentServiceError(
      'PASSENGER_EMAIL_REQUIRED',
      'Informe um e-mail válido para pagar com cartão.',
    );
  }

  const pricing = cardPriceForBaseFare(
    input.ride.quote.totalAmountCents,
    input.cardPriceAdjustmentBps,
  );

  let payment = await createPaymentForRide(input.finance, {
    ride: input.ride,
    method: 'card',
    processor: 'mercado-pago-orders',
    idempotencyKey: input.idempotencyKey,
    amountCents: pricing.totalAmountCents,
    ...(input.now != null ? { now: input.now } : {}),
  });

  if (
    payment.status === 'paid' ||
    payment.status === 'refunded' ||
    payment.status === 'failed' ||
    payment.status === 'cancelled'
  ) {
    throw new PaymentDomainError(
      'INVALID_PAYMENT_TRANSITION',
      `Pagamento em estado ${payment.status} não pode gerar nova cobrança.`,
    );
  }

  const card = await input.gateway.createCardOrder({
    paymentId: payment.id,
    amountCents: payment.amountCents,
    payerEmail: email,
    cardToken: input.cardToken,
    paymentMethodId: input.paymentMethodId,
    paymentMethodType: input.paymentMethodType,
    installments: input.installments,
    idempotencyKey: `mp-card-${payment.id}`,
  });

  payment = await input.finance.markPaymentPending({
    paymentId: payment.id,
    processorPaymentId: card.orderId,
    ...(input.now != null ? { pendingAt: input.now } : {}),
  });

  return { payment, card, pricing };
}

export type MercadoPagoOrderApplication =
  | { kind: 'pending'; payment: PaymentRecord }
  | { kind: 'paid'; payment: PaymentRecord }
  | { kind: 'failed'; payment: PaymentRecord }
  | { kind: 'cancelled'; payment: PaymentRecord }
  | { kind: 'partially_refunded'; payment: PaymentRecord }
  | { kind: 'refunded'; payment: PaymentRecord; duplicateRefund: boolean };

export async function applyMercadoPagoOrderStatus(input: {
  finance: FinanceRepository;
  order: MercadoPagoOrderStatus;
  now?: Date;
}): Promise<MercadoPagoOrderApplication> {
  const paymentId = input.order.externalReference.trim();
  const payment = await input.finance.findPaymentById(paymentId);
  if (
    payment == null ||
    payment.processor !== 'mercado-pago-orders'
  ) {
    throw new MercadoPagoPaymentServiceError(
      'ORDER_PAYMENT_MISMATCH',
      'Order não corresponde a um pagamento do Ramo Nessa.',
    );
  }

  if (payment.processorPaymentId !== input.order.orderId) {
    throw new MercadoPagoPaymentServiceError(
      'ORDER_REFERENCE_MISMATCH',
      'Referência da Order não confere com o pagamento.',
    );
  }

  if (payment.amountCents !== input.order.totalAmountCents) {
    throw new MercadoPagoPaymentServiceError(
      'ORDER_AMOUNT_MISMATCH',
      'Valor da Order não confere com o pagamento.',
    );
  }

  const status = input.order.status.toLowerCase();
  const paymentStatus = input.order.paymentStatus.toLowerCase();
  const refundState = mercadoPagoOrderRefundState(input.order);

  if (refundState === 'full') {
    if (payment.status === 'refunded') {
      const duplicate = await input.finance.refundExternalPayment({
        paymentId: payment.id,
        ...(input.now != null ? { refundedAt: input.now } : {}),
      });
      return {
        kind: 'refunded',
        payment: duplicate.payment,
        duplicateRefund: true,
      };
    }

    const refunded = await input.finance.refundExternalPayment({
      paymentId: payment.id,
      ...(input.now != null ? { refundedAt: input.now } : {}),
    });
    return {
      kind: 'refunded',
      payment: refunded.payment,
      duplicateRefund: refunded.duplicateRefund,
    };
  }

  if (refundState === 'partial') {
    return { kind: 'partially_refunded', payment };
  }

  if (
    status === 'processed' ||
    paymentStatus === 'processed'
  ) {
    if (payment.status === 'paid') {
      return { kind: 'paid', payment };
    }

    const captured = await input.finance.capturePayment({
      paymentId: payment.id,
      processorEventId:
        `mp-order:${input.order.orderId}:processed`,
      payload: {
        orderStatus: input.order.status,
        orderStatusDetail: input.order.statusDetail,
        paymentId: input.order.paymentId,
        paymentStatus: input.order.paymentStatus,
        paymentStatusDetail: input.order.paymentStatusDetail,
      },
      ...(input.now != null ? { capturedAt: input.now } : {}),
    });
    return { kind: 'paid', payment: captured.payment };
  }

  if (status === 'failed' || paymentStatus === 'failed') {
    if (payment.status === 'failed') {
      return { kind: 'failed', payment };
    }
    const failed = await input.finance.markPaymentTerminal({
      paymentId: payment.id,
      status: 'failed',
      ...(input.now != null ? { updatedAt: input.now } : {}),
    });
    return { kind: 'failed', payment: failed };
  }

  if (
    status === 'canceled' ||
    status === 'cancelled' ||
    paymentStatus === 'canceled' ||
    paymentStatus === 'cancelled'
  ) {
    if (payment.status === 'cancelled') {
      return { kind: 'cancelled', payment };
    }
    const cancelled = await input.finance.markPaymentTerminal({
      paymentId: payment.id,
      status: 'cancelled',
      ...(input.now != null ? { updatedAt: input.now } : {}),
    });
    return { kind: 'cancelled', payment: cancelled };
  }

  if (
    status === 'created' ||
    status === 'processing' ||
    status === 'action_required' ||
    paymentStatus === 'pending' ||
    paymentStatus === 'processing' ||
    paymentStatus === 'action_required'
  ) {
    return { kind: 'pending', payment };
  }

  throw new MercadoPagoPaymentServiceError(
    'ORDER_STATUS_UNSUPPORTED',
    `Status da Order ainda não suportado: ${input.order.status}.`,
  );
}
