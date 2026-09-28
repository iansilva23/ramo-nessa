import type { AuthIdentityRecord } from '../auth/auth-otp-repository.js';
import type { FinanceRepository } from './finance-repository.js';
import {
  mercadoPagoOrderRefundState,
  type MercadoPagoCardOrder,
  type MercadoPagoOrderStatus,
  type MercadoPagoOrdersClient,
  type MercadoPagoPixOrder,
} from './mercado-pago-orders.js';
import { createWalletTopup } from './wallet-services.js';
import type { WalletTopupRecord } from './wallet.js';

export class MercadoPagoWalletTopupError extends Error {
  constructor(
    public readonly code:
      | 'MERCADO_PAGO_NOT_CONFIGURED'
      | 'PASSENGER_EMAIL_REQUIRED'
      | 'TOPUP_NOT_FOUND'
      | 'TOPUP_PROCESSOR_MISMATCH'
      | 'ORDER_REFERENCE_MISMATCH'
      | 'ORDER_AMOUNT_MISMATCH'
      | 'ORDER_STATUS_UNSUPPORTED',
    message: string,
  ) {
    super(message);
    this.name = 'MercadoPagoWalletTopupError';
  }
}

function payerEmail(
  identity: AuthIdentityRecord | null,
  override?: string,
): string {
  const email =
    override?.trim().toLowerCase() ||
    identity?.emailNormalized?.trim().toLowerCase() ||
    '';
  if (!email) {
    throw new MercadoPagoWalletTopupError(
      'PASSENGER_EMAIL_REQUIRED',
      'Informe um e-mail válido para recarregar a carteira.',
    );
  }
  return email;
}

function assertGateway(
  gateway: MercadoPagoOrdersClient | null,
): MercadoPagoOrdersClient {
  if (gateway == null) {
    throw new MercadoPagoWalletTopupError(
      'MERCADO_PAGO_NOT_CONFIGURED',
      'Mercado Pago ainda não está configurado neste ambiente.',
    );
  }
  return gateway;
}

export async function createMercadoPagoWalletPixTopup(input: {
  finance: FinanceRepository;
  gateway: MercadoPagoOrdersClient | null;
  passengerId: string;
  identity: AuthIdentityRecord | null;
  payerEmail?: string;
  amountCents: number;
  idempotencyKey: string;
  now?: Date;
}): Promise<{ topup: WalletTopupRecord; pix: MercadoPagoPixOrder }> {
  const gateway = assertGateway(input.gateway);
  const email = payerEmail(input.identity, input.payerEmail);
  let topup = await createWalletTopup(input.finance, {
    passengerId: input.passengerId,
    method: 'pix',
    processor: 'mercado-pago-orders',
    amountCents: input.amountCents,
    idempotencyKey: input.idempotencyKey,
    ...(input.now == null ? {} : { now: input.now }),
  });

  const pix = await gateway.createPixOrder({
    paymentId: topup.id,
    amountCents: topup.amountCents,
    payerEmail: email,
    idempotencyKey: `mp-wallet-pix-${topup.id}`,
  });

  topup = await input.finance.markWalletTopupPending({
    walletTopupId: topup.id,
    processorTopupId: pix.orderId,
    ...(input.now == null ? {} : { updatedAt: input.now }),
  });

  return { topup, pix };
}

export async function createMercadoPagoWalletCardTopup(input: {
  finance: FinanceRepository;
  gateway: MercadoPagoOrdersClient | null;
  passengerId: string;
  identity: AuthIdentityRecord | null;
  payerEmail?: string;
  amountCents: number;
  cardToken: string;
  paymentMethodId: string;
  paymentMethodType: 'credit_card' | 'debit_card';
  installments: number;
  idempotencyKey: string;
  now?: Date;
}): Promise<{ topup: WalletTopupRecord; card: MercadoPagoCardOrder }> {
  const gateway = assertGateway(input.gateway);
  const email = payerEmail(input.identity, input.payerEmail);
  let topup = await createWalletTopup(input.finance, {
    passengerId: input.passengerId,
    method: 'card',
    processor: 'mercado-pago-orders',
    amountCents: input.amountCents,
    idempotencyKey: input.idempotencyKey,
    ...(input.now == null ? {} : { now: input.now }),
  });

  const card = await gateway.createCardOrder({
    paymentId: topup.id,
    amountCents: topup.amountCents,
    payerEmail: email,
    cardToken: input.cardToken,
    paymentMethodId: input.paymentMethodId,
    paymentMethodType: input.paymentMethodType,
    installments: input.installments,
    idempotencyKey: `mp-wallet-card-${topup.id}`,
  });

  topup = await input.finance.markWalletTopupPending({
    walletTopupId: topup.id,
    processorTopupId: card.orderId,
    ...(input.now == null ? {} : { updatedAt: input.now }),
  });

  return { topup, card };
}

export type MercadoPagoWalletTopupApplication =
  | { kind: 'pending'; topup: WalletTopupRecord }
  | { kind: 'paid'; topup: WalletTopupRecord; duplicateCapture: boolean }
  | { kind: 'failed'; topup: WalletTopupRecord }
  | { kind: 'cancelled'; topup: WalletTopupRecord }
  | { kind: 'partially_refunded'; topup: WalletTopupRecord }
  | { kind: 'refunded'; topup: WalletTopupRecord; duplicateRefund: boolean };

export async function applyMercadoPagoWalletTopupOrderStatus(input: {
  finance: FinanceRepository;
  order: MercadoPagoOrderStatus;
  now?: Date;
}): Promise<MercadoPagoWalletTopupApplication> {
  const topupId = input.order.externalReference.trim();
  const topup = await input.finance.findWalletTopupById(topupId);
  if (topup == null) {
    throw new MercadoPagoWalletTopupError(
      'TOPUP_NOT_FOUND',
      'Order não corresponde a uma recarga do Ramo Nessa.',
    );
  }
  if (topup.processor !== 'mercado-pago-orders') {
    throw new MercadoPagoWalletTopupError(
      'TOPUP_PROCESSOR_MISMATCH',
      'A recarga pertence a outro processador.',
    );
  }
  if (
    topup.processorTopupId != null &&
    topup.processorTopupId !== input.order.orderId
  ) {
    throw new MercadoPagoWalletTopupError(
      'ORDER_REFERENCE_MISMATCH',
      'Referência da Order não confere com a recarga.',
    );
  }
  if (topup.amountCents !== input.order.totalAmountCents) {
    throw new MercadoPagoWalletTopupError(
      'ORDER_AMOUNT_MISMATCH',
      'Valor da Order não confere com a recarga.',
    );
  }

  const status = input.order.status.toLowerCase();
  const paymentStatus = input.order.paymentStatus.toLowerCase();
  const refundState = mercadoPagoOrderRefundState(input.order);

  if (refundState === 'full') {
    if (topup.status === 'refunded') {
      const duplicate = await input.finance.refundWalletTopup({
        walletTopupId: topup.id,
        ...(input.now == null ? {} : { refundedAt: input.now }),
      });
      return {
        kind: 'refunded',
        topup: duplicate.topup,
        duplicateRefund: true,
      };
    }
    const refunded = await input.finance.refundWalletTopup({
      walletTopupId: topup.id,
      ...(input.now == null ? {} : { refundedAt: input.now }),
    });
    return {
      kind: 'refunded',
      topup: refunded.topup,
      duplicateRefund: refunded.duplicateRefund,
    };
  }

  if (refundState === 'partial') {
    return { kind: 'partially_refunded', topup };
  }

  if (status === 'processed' || paymentStatus === 'processed') {
    if (topup.status === 'paid') {
      return { kind: 'paid', topup, duplicateCapture: true };
    }
    const captured = await input.finance.captureWalletTopup({
      walletTopupId: topup.id,
      processorEventId: `mp-order:${input.order.orderId}:processed`,
      processorTopupId: input.order.orderId,
      payload: {
        orderStatus: input.order.status,
        orderStatusDetail: input.order.statusDetail,
        paymentId: input.order.paymentId,
        paymentStatus: input.order.paymentStatus,
        paymentStatusDetail: input.order.paymentStatusDetail,
      },
      ...(input.now == null ? {} : { capturedAt: input.now }),
    });
    return {
      kind: 'paid',
      topup: captured.topup,
      duplicateCapture: captured.duplicateEvent,
    };
  }

  if (status === 'failed' || paymentStatus === 'failed') {
    const failed = await input.finance.markWalletTopupTerminal({
      walletTopupId: topup.id,
      status: 'failed',
      ...(input.now == null ? {} : { updatedAt: input.now }),
    });
    return { kind: 'failed', topup: failed };
  }

  if (
    status === 'canceled' ||
    status === 'cancelled' ||
    paymentStatus === 'canceled' ||
    paymentStatus === 'cancelled'
  ) {
    const cancelled = await input.finance.markWalletTopupTerminal({
      walletTopupId: topup.id,
      status: 'cancelled',
      ...(input.now == null ? {} : { updatedAt: input.now }),
    });
    return { kind: 'cancelled', topup: cancelled };
  }

  if (
    status === 'created' ||
    status === 'processing' ||
    status === 'action_required' ||
    paymentStatus === 'pending' ||
    paymentStatus === 'processing' ||
    paymentStatus === 'action_required'
  ) {
    return { kind: 'pending', topup };
  }

  throw new MercadoPagoWalletTopupError(
    'ORDER_STATUS_UNSUPPORTED',
    `Status da Order de recarga ainda não suportado: ${input.order.status}.`,
  );
}
