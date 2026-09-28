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

export function createDriverPayoutProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DriverPayoutProvider | null {
  const rawUrl = env.DRIVER_PAYOUT_PROVIDER_URL?.trim() ?? '';
  const token = env.DRIVER_PAYOUT_PROVIDER_TOKEN?.trim() ?? '';
  const name =
    env.DRIVER_PAYOUT_PROVIDER_NAME?.trim() || 'pix-payout-gateway';

  if (!rawUrl && !token) return null;
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
