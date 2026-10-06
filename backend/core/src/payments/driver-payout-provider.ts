import {
  createPrivateKey,
  sign as signPayload,
  type KeyObject,
} from 'node:crypto';

import type { PixKeyType } from './payout.js';

export type DriverPayoutProviderStatus = 'processing' | 'paid' | 'failed';

export interface DriverPayoutProviderResult {
  providerPayoutId: string;
  status: DriverPayoutProviderStatus;
}

export interface DriverPayoutProvider {
  readonly name: string;
  createPixPayout(input: {
    payoutId: string;
    amountCents: number;
    pixKeyType: PixKeyType;
    pixKey: string;
  }): Promise<DriverPayoutProviderResult>;
  getPayoutStatus(
    providerPayoutId: string,
  ): Promise<DriverPayoutProviderResult>;
}

export class DriverPayoutProviderError extends Error {
  constructor(
    public readonly code:
      | 'PAYOUT_PROVIDER_CONFIG_INVALID'
      | 'PAYOUT_PROVIDER_UNAVAILABLE'
      | 'PAYOUT_PROVIDER_RESPONSE_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'DriverPayoutProviderError';
  }
}

type PayoutFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

function objectValue(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseProviderResult(
  payload: unknown,
): DriverPayoutProviderResult {
  const record = objectValue(payload);
  const providerPayoutId =
    typeof record.id === 'string' ? record.id.trim() : '';
  const status = record.status;

  if (
    providerPayoutId.length < 3 ||
    (status !== 'processing' && status !== 'paid' && status !== 'failed')
  ) {
    throw new DriverPayoutProviderError(
      'PAYOUT_PROVIDER_RESPONSE_INVALID',
      'O provedor de repasse retornou uma resposta inválida.',
    );
  }

  return {
    providerPayoutId,
    status,
  };
}

export class HttpDriverPayoutProvider implements DriverPayoutProvider {
  constructor(
    public readonly name: string,
    private readonly baseUrl: URL,
    private readonly apiToken: string,
    private readonly fetcher: PayoutFetch = (url, init) => fetch(url, init),
  ) {
    if (
      name.trim().length < 2 ||
      apiToken.trim().length < 20 ||
      (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost')
    ) {
      throw new DriverPayoutProviderError(
        'PAYOUT_PROVIDER_CONFIG_INVALID',
        'Configuração do provedor de repasse Pix inválida.',
      );
    }
  }

  private async request(
    path: string,
    init: RequestInit,
  ): Promise<DriverPayoutProviderResult> {
    let response: Response;
    try {
      response = await this.fetcher(
        new URL(path, this.baseUrl).toString(),
        {
          ...init,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${this.apiToken}`,
            'content-type': 'application/json',
            ...(init.headers ?? {}),
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      throw new DriverPayoutProviderError(
        'PAYOUT_PROVIDER_UNAVAILABLE',
        'O provedor de repasse Pix está indisponível.',
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new DriverPayoutProviderError(
        'PAYOUT_PROVIDER_UNAVAILABLE',
        `O provedor de repasse Pix respondeu HTTP ${response.status}.`,
      );
    }

    return parseProviderResult(payload);
  }

  async createPixPayout(input: {
    payoutId: string;
    amountCents: number;
    pixKeyType: PixKeyType;
    pixKey: string;
  }): Promise<DriverPayoutProviderResult> {
    return this.request('/v1/pix/payouts', {
      method: 'POST',
      headers: {
        'idempotency-key': input.payoutId,
      },
      body: JSON.stringify({
        externalReference: input.payoutId,
        amountCents: input.amountCents,
        pixKeyType: input.pixKeyType,
        pixKey: input.pixKey,
      }),
    });
  }

  async getPayoutStatus(
    providerPayoutId: string,
  ): Promise<DriverPayoutProviderResult> {
    return this.request(
      `/v1/pix/payouts/${encodeURIComponent(providerPayoutId)}`,
      { method: 'GET' },
    );
  }
}

type MercadoPagoPayoutMode = 'test' | 'production';

function mercadoPagoPixKeyType(
  pixKeyType: PixKeyType,
): 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'PIX_CODE' {
  switch (pixKeyType) {
    case 'cpf':
      return 'CPF';
    case 'cnpj':
      return 'CNPJ';
    case 'email':
      return 'EMAIL';
    case 'phone':
      return 'PHONE';
    case 'random':
      return 'PIX_CODE';
  }
}

function mercadoPagoAmount(amountCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents < 100) {
    throw new DriverPayoutProviderError(
      'PAYOUT_PROVIDER_CONFIG_INVALID',
      'Mercado Pago Payouts exige repasse Pix de pelo menos R$ 1,00.',
    );
  }
  return Number((amountCents / 100).toFixed(2));
}

function mercadoPagoCompositeId(
  payoutId: string,
  transactionId: string,
): string {
  return `${payoutId}/${transactionId}`;
}

function parseMercadoPagoCompositeId(providerPayoutId: string): {
  payoutId: string;
  transactionId: string;
} {
  const parts = providerPayoutId.split('/');
  const payoutId = parts[0]?.trim() ?? '';
  const transactionId = parts[1]?.trim() ?? '';
  if (
    parts.length !== 2 ||
    !/^POP[A-Z0-9]+$/i.test(payoutId) ||
    !/^TOP[A-Z0-9]+$/i.test(transactionId)
  ) {
    throw new DriverPayoutProviderError(
      'PAYOUT_PROVIDER_RESPONSE_INVALID',
      'Referência de payout do Mercado Pago inválida.',
    );
  }
  return { payoutId, transactionId };
}

function mercadoPagoTransactionStatus(
  payload: unknown,
): DriverPayoutProviderStatus {
  const record = objectValue(payload);
  const status =
    typeof record.status === 'string'
      ? record.status.trim().toLowerCase()
      : '';
  const detail =
    typeof record.status_detail === 'string'
      ? record.status_detail.trim().toLowerCase()
      : '';

  if (status === 'success' && detail === 'accredited') {
    return 'paid';
  }

  if (
    status === 'error' ||
    status === 'rejected' ||
    status === 'canceled' ||
    status === 'refunded'
  ) {
    return 'failed';
  }

  if (
    status === 'created' ||
    status === 'approved' ||
    status === 'processed' ||
    status === 'transaction_in_process' ||
    (status === 'success' && detail === 'in_progress')
  ) {
    return 'processing';
  }

  throw new DriverPayoutProviderError(
    'PAYOUT_PROVIDER_RESPONSE_INVALID',
    'Mercado Pago retornou status de payout não reconhecido.',
  );
}

function readMercadoPagoPayoutTransactionIds(payload: unknown): {
  payoutId: string;
  transactionId: string;
} {
  const record = objectValue(payload);
  const payoutId =
    typeof record.id === 'string' ? record.id.trim() : '';
  const transactions = Array.isArray(record.transactions)
    ? record.transactions
    : [];
  const first = objectValue(transactions[0]);
  const transactionId =
    typeof first.id === 'string' ? first.id.trim() : '';

  if (
    !/^POP[A-Z0-9]+$/i.test(payoutId) ||
    !/^TOP[A-Z0-9]+$/i.test(transactionId)
  ) {
    throw new DriverPayoutProviderError(
      'PAYOUT_PROVIDER_RESPONSE_INVALID',
      'Mercado Pago não retornou os identificadores do payout Pix.',
    );
  }

  return { payoutId, transactionId };
}

export class MercadoPagoDriverPayoutProvider
  implements DriverPayoutProvider {
  readonly name = 'mercado-pago-payouts';

  private readonly signingKey: KeyObject | null;

  constructor(
    private readonly mode: MercadoPagoPayoutMode,
    private readonly accessToken: string,
    private readonly privateKeyPem?: string,
    private readonly fetcher: PayoutFetch = (url, init) => fetch(url, init),
  ) {
    if (
      (mode !== 'test' && mode !== 'production') ||
      accessToken.trim().length < 20
    ) {
      throw new DriverPayoutProviderError(
        'PAYOUT_PROVIDER_CONFIG_INVALID',
        'Credenciais do Mercado Pago Payouts são inválidas.',
      );
    }

    if (mode === 'production') {
      const privateKey = privateKeyPem?.trim() ?? '';
      if (!privateKey) {
        throw new DriverPayoutProviderError(
          'PAYOUT_PROVIDER_CONFIG_INVALID',
          'Produção do Mercado Pago Payouts exige chave privada Ed25519.',
        );
      }

      try {
        const key = createPrivateKey(privateKey);
        if (key.asymmetricKeyType !== 'ed25519') {
          throw new Error('not-ed25519');
        }
        this.signingKey = key;
      } catch {
        throw new DriverPayoutProviderError(
          'PAYOUT_PROVIDER_CONFIG_INVALID',
          'Chave privada Ed25519 do Mercado Pago Payouts é inválida.',
        );
      }
    } else {
      this.signingKey = null;
    }
  }

  private async request(
    path: string,
    init: RequestInit,
  ): Promise<unknown> {
    const body =
      typeof init.body === 'string' ? init.body : undefined;
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${this.accessToken}`,
      'content-type': 'application/json',
    };

    if (this.mode === 'test') {
      headers['x-test-token'] = 'true';
    } else if (body != null) {
      if (this.signingKey == null) {
        throw new DriverPayoutProviderError(
          'PAYOUT_PROVIDER_CONFIG_INVALID',
          'Assinatura de produção do Mercado Pago Payouts indisponível.',
        );
      }
      headers['x-enforce-signature'] = 'true';
      headers['x-signature'] = signPayload(
        null,
        Buffer.from(body, 'utf8'),
        this.signingKey,
      ).toString('base64');
    }

    const providedHeaders = Object.fromEntries(
      new Headers(init.headers).entries(),
    );

    let response: Response;
    try {
      response = await this.fetcher(
        `https://api.mercadopago.com${path}`,
        {
          ...init,
          headers: {
            ...headers,
            ...providedHeaders,
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      throw new DriverPayoutProviderError(
        'PAYOUT_PROVIDER_UNAVAILABLE',
        'Mercado Pago Payouts está indisponível.',
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const record = objectValue(payload);
      const code =
        typeof record.code === 'string' ? record.code.trim() : '';
      throw new DriverPayoutProviderError(
        'PAYOUT_PROVIDER_UNAVAILABLE',
        code
          ? `Mercado Pago Payouts respondeu HTTP ${response.status} (${code}).`
          : `Mercado Pago Payouts respondeu HTTP ${response.status}.`,
      );
    }

    return payload;
  }

  async createPixPayout(input: {
    payoutId: string;
    amountCents: number;
    pixKeyType: PixKeyType;
    pixKey: string;
  }): Promise<DriverPayoutProviderResult> {
    const body = JSON.stringify({
      external_reference: input.payoutId,
      description: 'Ramo Nessa driver payout',
      transactions: [
        {
          description: 'Ramo Nessa driver payout',
          type: 'pix',
          pix: {
            type: mercadoPagoPixKeyType(input.pixKeyType),
            chave: input.pixKey,
          },
          amount: {
            currency: 'BRL',
            value: mercadoPagoAmount(input.amountCents),
          },
          external_reference: input.payoutId,
        },
      ],
    });

    const payload = await this.request('/v1/payouts', {
      method: 'POST',
      headers: {
        'x-idempotency-key': input.payoutId,
      },
      body,
    });
    const ids = readMercadoPagoPayoutTransactionIds(payload);

    return {
      providerPayoutId: mercadoPagoCompositeId(
        ids.payoutId,
        ids.transactionId,
      ),
      status: 'processing',
    };
  }

  async getPayoutStatus(
    providerPayoutId: string,
  ): Promise<DriverPayoutProviderResult> {
    const ids = parseMercadoPagoCompositeId(providerPayoutId);
    const payload = await this.request(
      `/v1/payouts/${encodeURIComponent(ids.payoutId)}/transactions/${encodeURIComponent(ids.transactionId)}`,
      { method: 'GET' },
    );

    return {
      providerPayoutId,
      status: mercadoPagoTransactionStatus(payload),
    };
  }
}

function payoutPrivateKeyFromEnv(
  env: NodeJS.ProcessEnv,
): string | undefined {
  const encoded =
    env.MERCADO_PAGO_PAYOUT_PRIVATE_KEY_BASE64?.trim() ?? '';
  if (!encoded) return undefined;

  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8').trim();
    return decoded || undefined;
  } catch {
    return undefined;
  }
}

export function createDriverPayoutProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DriverPayoutProvider | null {
  const configuredName =
    env.DRIVER_PAYOUT_PROVIDER_NAME?.trim() ?? '';

  if (configuredName === 'mercado-pago-payouts') {
    const rawMode =
      env.MERCADO_PAGO_PAYOUT_MODE?.trim() ||
      env.MERCADO_PAGO_MODE?.trim() ||
      (env.NODE_ENV === 'production' ? 'production' : 'test');

    if (rawMode !== 'test' && rawMode !== 'production') {
      throw new DriverPayoutProviderError(
        'PAYOUT_PROVIDER_CONFIG_INVALID',
        'MERCADO_PAGO_PAYOUT_MODE deve ser test ou production.',
      );
    }

    const accessToken =
      rawMode === 'production'
        ? env.MERCADO_PAGO_PAYOUT_ACCESS_TOKEN?.trim()
        : env.MERCADO_PAGO_PAYOUT_ACCESS_TOKEN_TEST?.trim();

    if (!accessToken) {
      throw new DriverPayoutProviderError(
        'PAYOUT_PROVIDER_CONFIG_INVALID',
        'Access Token do Mercado Pago Payouts não configurado.',
      );
    }

    return new MercadoPagoDriverPayoutProvider(
      rawMode,
      accessToken,
      payoutPrivateKeyFromEnv(env),
    );
  }

  const rawUrl = env.DRIVER_PAYOUT_PROVIDER_URL?.trim() ?? '';
  const token = env.DRIVER_PAYOUT_PROVIDER_TOKEN?.trim() ?? '';
  const name = configuredName || 'pix-payout-gateway';

  if (!rawUrl && !token && !configuredName) return null;
  if (!rawUrl || !token) {
    throw new DriverPayoutProviderError(
      'PAYOUT_PROVIDER_CONFIG_INVALID',
      'URL e token do provedor de repasse Pix devem ser configurados juntos.',
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl.endsWith('/') ? rawUrl : `${rawUrl}/`);
  } catch {
    throw new DriverPayoutProviderError(
      'PAYOUT_PROVIDER_CONFIG_INVALID',
      'URL do provedor de repasse Pix é inválida.',
    );
  }

  if (
    env.NODE_ENV === 'production' &&
    url.protocol !== 'https:'
  ) {
    throw new DriverPayoutProviderError(
      'PAYOUT_PROVIDER_CONFIG_INVALID',
      'Produção exige HTTPS no provedor de repasse Pix.',
    );
  }

  return new HttpDriverPayoutProvider(name, url, token);
}
