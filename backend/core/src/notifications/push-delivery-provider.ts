import type {
  PushPlatform,
  PushTokenProvider,
} from './push-device-repository.js';

export interface PushMessage {
  type: string;
  title: string;
  body: string;
  data?: Readonly<Record<string, string>>;
}

export interface PushDeliveryRequest {
  token: string;
  tokenProvider: PushTokenProvider;
  platform: PushPlatform;
  message: PushMessage;
}

export interface PushDeliveryResult {
  delivered: boolean;
  invalidToken?: boolean;
}

export interface PushDeliveryProvider {
  readonly kind: string;
  send(input: PushDeliveryRequest): Promise<PushDeliveryResult>;
}

class DisabledPushDeliveryProvider implements PushDeliveryProvider {
  readonly kind = 'disabled';

  async send(): Promise<PushDeliveryResult> {
    return { delivered: false };
  }
}

class WebhookPushDeliveryProvider implements PushDeliveryProvider {
  readonly kind = 'webhook';

  constructor(
    private readonly endpoint: URL,
    private readonly secret: string,
  ) {}

  async send(input: PushDeliveryRequest): Promise<PushDeliveryResult> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: input.token,
        tokenProvider: input.tokenProvider,
        platform: input.platform,
        message: input.message,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (response.status === 404 || response.status === 410) {
      return { delivered: false, invalidToken: true };
    }
    if (!response.ok) {
      throw new Error(`Provider push respondeu HTTP ${response.status}.`);
    }
    return { delivered: true };
  }
}

export function resolvePushDeliveryProviderFromEnv(): PushDeliveryProvider {
  const kind = process.env.PUSH_PROVIDER?.trim().toLowerCase();
  if (kind == null || kind === '' || kind === 'disabled') {
    return new DisabledPushDeliveryProvider();
  }

  if (kind !== 'webhook') {
    throw new Error('PUSH_PROVIDER deve ser disabled ou webhook.');
  }

  const rawUrl = process.env.PUSH_WEBHOOK_URL?.trim();
  const secret = process.env.PUSH_WEBHOOK_SECRET?.trim();
  if (rawUrl == null || secret == null || secret.length < 16) {
    throw new Error(
      'PUSH_WEBHOOK_URL e PUSH_WEBHOOK_SECRET são obrigatórios para push webhook.',
    );
  }

  const endpoint = new URL(rawUrl);
  if (endpoint.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('PUSH_WEBHOOK_URL deve usar HTTPS em produção.');
  }

  return new WebhookPushDeliveryProvider(endpoint, secret);
}
