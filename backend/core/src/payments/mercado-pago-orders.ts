import { createHmac, timingSafeEqual } from 'node:crypto';

type MpFetch = (url: string, init?: RequestInit) => Promise<Response>;

export class MercadoPagoOrdersError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly apiCode?: string,
  ) {
    super(message);
    this.name = 'MercadoPagoOrdersError';
  }
}

export interface MercadoPagoPixOrder {
  orderId: string;
  paymentId: string;
  status: string;
  statusDetail: string;
  ticketUrl: string;
  qrCode: string;
  qrCodeBase64: string;
}

export interface MercadoPagoCardOrder {
  orderId: string;
  paymentId: string;
  status: string;
  statusDetail: string;
  challengeUrl?: string;
}

export interface MercadoPagoOrderStatus {
  orderId: string;
  externalReference: string;
  status: string;
  statusDetail: string;
  totalAmountCents: number;
  paymentId: string;
  paymentStatus: string;
  paymentStatusDetail: string;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MercadoPagoOrdersError('Resposta inválida do Mercado Pago.');
  }
  return value as Record<string, unknown>;
}

function apiErrorCode(value: unknown): string | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const payload = value as Record<string, unknown>;
  if (typeof payload.code === 'string' && payload.code.trim()) {
    return payload.code.trim();
  }

  if (Array.isArray(payload.errors)) {
    for (const item of payload.errors) {
      if (
        item != null &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        typeof (item as Record<string, unknown>).code === 'string'
      ) {
        const code = String(
          (item as Record<string, unknown>).code,
        ).trim();
        if (code) return code;
      }
    }
  }

  return undefined;
}

function firstPayment(payload: Record<string, unknown>) {
  const transactions = asObject(payload.transactions);
  if (!Array.isArray(transactions.payments) || transactions.payments.length < 1) {
    throw new MercadoPagoOrdersError('Order sem pagamento retornado.');
  }
  return asObject(transactions.payments[0]);
}

function cents(value: unknown): number {
  const raw = typeof value === 'string' ? value : '';
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new MercadoPagoOrdersError(
      'Valor inválido retornado pelo Mercado Pago.',
    );
  }
  const [whole, decimal = ''] = raw.split('.');
  return Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
}

function amount(amountCents: number): string {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new MercadoPagoOrdersError('Valor inválido para pagamento.');
  }
  return (amountCents / 100).toFixed(2);
}

export type MercadoPagoRefundState = 'none' | 'partial' | 'full';

export function mercadoPagoOrderRefundState(
  order: MercadoPagoOrderStatus,
): MercadoPagoRefundState {
  const status = order.status.toLowerCase();
  const statusDetail = order.statusDetail.toLowerCase();
  const paymentStatus = order.paymentStatus.toLowerCase();
  const paymentStatusDetail = order.paymentStatusDetail.toLowerCase();

  if (
    status === 'refunded' ||
    paymentStatus === 'refunded' ||
    statusDetail === 'refunded' ||
    paymentStatusDetail === 'refunded'
  ) {
    return 'full';
  }

  if (
    statusDetail === 'partially_refunded' ||
    paymentStatusDetail === 'partially_refunded'
  ) {
    return 'partial';
  }

  return 'none';
}

export class MercadoPagoOrdersClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: MpFetch = (url, init) => fetch(url, init),
  ) {
    if (accessToken.trim().length < 20) {
      throw new MercadoPagoOrdersError(
        'Access Token do Mercado Pago não configurado.',
      );
    }
  }

  private async request(path: string, init: RequestInit) {
    const response = await this.fetcher(
      `https://api.mercadopago.com${path}`,
      {
        ...init,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${this.accessToken}`,
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(10_000),
      },
    );

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const code = apiErrorCode(parsed);
      throw new MercadoPagoOrdersError(
        code
          ? `Mercado Pago respondeu HTTP ${response.status} (${code}).`
          : `Mercado Pago respondeu HTTP ${response.status}.`,
        response.status,
        code,
      );
    }
    return asObject(parsed);
  }

  async createPixOrder(input: {
    paymentId: string;
    amountCents: number;
    payerEmail: string;
    idempotencyKey: string;
  }): Promise<MercadoPagoPixOrder> {
    const total = amount(input.amountCents);
    const payload = await this.request('/v1/orders', {
      method: 'POST',
      headers: { 'x-idempotency-key': input.idempotencyKey },
      body: JSON.stringify({
        type: 'online',
        total_amount: total,
        external_reference: input.paymentId,
        processing_mode: 'automatic',
        transactions: {
          payments: [{
            amount: total,
            payment_method: { id: 'pix', type: 'bank_transfer' },
            expiration_time: 'PT30M',
          }],
        },
        payer: { email: input.payerEmail },
      }),
    });

    const payment = firstPayment(payload);
    const method = asObject(payment.payment_method);
    const orderId = typeof payload.id === 'string' ? payload.id : '';
    const paymentId = typeof payment.id === 'string' ? payment.id : '';
    const ticketUrl =
      typeof method.ticket_url === 'string' ? method.ticket_url : '';
    const qrCode = typeof method.qr_code === 'string' ? method.qr_code : '';
    const qrCodeBase64 =
      typeof method.qr_code_base64 === 'string'
        ? method.qr_code_base64
        : '';

    if (!orderId || !paymentId || (!ticketUrl && !qrCode)) {
      throw new MercadoPagoOrdersError(
        'Mercado Pago não retornou os dados necessários do Pix.',
      );
    }

    return {
      orderId,
      paymentId,
      status: typeof payload.status === 'string' ? payload.status : '',
      statusDetail:
        typeof payload.status_detail === 'string'
          ? payload.status_detail
          : '',
      ticketUrl,
      qrCode,
      qrCodeBase64,
    };
  }

  async createCardOrder(input: {
    paymentId: string;
    amountCents: number;
    payerEmail: string;
    cardToken: string;
    paymentMethodId: string;
    paymentMethodType: 'credit_card' | 'debit_card';
    installments: number;
    idempotencyKey: string;
  }): Promise<MercadoPagoCardOrder> {
    const total = amount(input.amountCents);
    const payload = await this.request('/v1/orders', {
      method: 'POST',
      headers: { 'x-idempotency-key': input.idempotencyKey },
      body: JSON.stringify({
        type: 'online',
        total_amount: total,
        external_reference: input.paymentId,
        processing_mode: 'automatic',
        capture_mode: 'automatic',
        config: {
          online: {
            transaction_security: {
              validation: 'on_fraud_risk',
              liability_shift: 'required',
            },
          },
        },
        payer: { email: input.payerEmail },
        transactions: {
          payments: [{
            amount: total,
            payment_method: {
              id: input.paymentMethodId,
              type: input.paymentMethodType,
              token: input.cardToken,
              installments: input.installments,
            },
          }],
        },
      }),
    });

    const payment = firstPayment(payload);
    const paymentMethod =
      payment.payment_method != null &&
      typeof payment.payment_method === 'object' &&
      !Array.isArray(payment.payment_method)
        ? payment.payment_method as Record<string, unknown>
        : {};
    const transactionSecurity =
      paymentMethod.transaction_security != null &&
      typeof paymentMethod.transaction_security === 'object' &&
      !Array.isArray(paymentMethod.transaction_security)
        ? paymentMethod.transaction_security as Record<string, unknown>
        : {};

    const orderId = typeof payload.id === 'string' ? payload.id : '';
    const paymentId = typeof payment.id === 'string' ? payment.id : '';
    if (!orderId || !paymentId) {
      throw new MercadoPagoOrdersError(
        'Mercado Pago não retornou os dados necessários do cartão.',
      );
    }

    const challengeUrl =
      typeof transactionSecurity.url === 'string' &&
      transactionSecurity.url.startsWith('https://')
        ? transactionSecurity.url
        : undefined;

    return {
      orderId,
      paymentId,
      status: typeof payload.status === 'string' ? payload.status : '',
      statusDetail:
        typeof payload.status_detail === 'string'
          ? payload.status_detail
          : '',
      ...(challengeUrl == null ? {} : { challengeUrl }),
    };
  }

  async getOrder(orderId: string): Promise<MercadoPagoOrderStatus> {
    const payload = await this.request(
      `/v1/orders/${encodeURIComponent(orderId)}`,
      { method: 'GET' },
    );
    const payment = firstPayment(payload);
    return {
      orderId: typeof payload.id === 'string' ? payload.id : orderId,
      externalReference:
        typeof payload.external_reference === 'string'
          ? payload.external_reference
          : '',
      status: typeof payload.status === 'string' ? payload.status : '',
      statusDetail:
        typeof payload.status_detail === 'string'
          ? payload.status_detail
          : '',
      totalAmountCents: cents(payload.total_amount),
      paymentId: typeof payment.id === 'string' ? payment.id : '',
      paymentStatus:
        typeof payment.status === 'string' ? payment.status : '',
      paymentStatusDetail:
        typeof payment.status_detail === 'string'
          ? payment.status_detail
          : '',
    };
  }

  async refundOrder(
    orderId: string,
    idempotencyKey: string,
  ): Promise<MercadoPagoOrderStatus> {
    try {
      await this.request(
        `/v1/orders/${encodeURIComponent(orderId)}/refund`,
        {
          method: 'POST',
          headers: { 'x-idempotency-key': idempotencyKey },
        },
      );
    } catch (error) {
      const safeReconciliationCodes = new Set([
        'order_already_refunded',
        'order_refund_already_in_process',
        'refund_in_progress',
      ]);

      if (
        !(error instanceof MercadoPagoOrdersError) ||
        error.apiCode == null ||
        !safeReconciliationCodes.has(error.apiCode)
      ) {
        throw error;
      }
    }

    return this.getOrder(orderId);
  }
}

export function mercadoPagoOrdersClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MercadoPagoOrdersClient | null {
  const production = env.MERCADO_PAGO_MODE === 'production';
  const token = production
    ? env.MERCADO_PAGO_ACCESS_TOKEN?.trim()
    : env.MERCADO_PAGO_ACCESS_TOKEN_TEST?.trim();

  return token ? new MercadoPagoOrdersClient(token) : null;
}


export function verifyMercadoPagoWebhookSignature(input: {
  xSignature: string;
  xRequestId: string;
  dataId: string;
  secret: string;
}): boolean {
  const parts = input.xSignature.split(',');
  let timestamp = '';
  let signature = '';

  for (const rawPart of parts) {
    const [rawKey, rawValue] = rawPart.split('=', 2);
    const key = rawKey?.trim();
    const value = rawValue?.trim() ?? '';
    if (key === 'ts') timestamp = value;
    if (key === 'v1') signature = value;
  }

  if (
    !timestamp ||
    !/^\d{10,16}$/.test(timestamp) ||
    !/^[0-9a-f]{64}$/i.test(signature) ||
    !input.xRequestId.trim() ||
    !input.dataId.trim() ||
    input.secret.length < 16
  ) {
    return false;
  }

  const manifest =
    `id:${input.dataId.toLowerCase()};request-id:${input.xRequestId};ts:${timestamp};`;
  const expected = createHmac('sha256', input.secret)
    .update(manifest, 'utf8')
    .digest('hex');

  const received = Buffer.from(signature, 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  return (
    received.length === expectedBytes.length &&
    timingSafeEqual(received, expectedBytes)
  );
}
