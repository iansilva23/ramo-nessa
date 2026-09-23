export interface OtpDeliveryProvider {
  readonly exposesCodeForDevelopment?: boolean;

  sendCode(input: {
    phoneE164: string;
    code: string;
    challengeId: string;
    expiresInSeconds: number;
  }): Promise<void>;
}

export class OtpDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpDeliveryError';
  }
}

export class DevOtpDeliveryProvider implements OtpDeliveryProvider {
  readonly exposesCodeForDevelopment = true;

  async sendCode(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new OtpDeliveryError(
        'Provider OTP de desenvolvimento é proibido em produção.',
      );
    }
  }
}

export class WebhookOtpDeliveryProvider implements OtpDeliveryProvider {
  constructor(
    private readonly endpoint: URL,
    private readonly token: string,
  ) {}

  async sendCode(input: {
    phoneE164: string;
    code: string;
    challengeId: string;
    expiresInSeconds: number;
  }): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    timeout.unref();

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.token}`,
          'idempotency-key': input.challengeId,
          'x-ramo-nessa-webhook-version': '1',
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new OtpDeliveryError(
          `Provider OTP recusou o envio com HTTP ${response.status}.`,
        );
      }
    } catch (error) {
      if (error instanceof OtpDeliveryError) throw error;
      throw new OtpDeliveryError('Provider OTP está indisponível.');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function resolveOtpDeliveryProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OtpDeliveryProvider | null {
  const configured = env.OTP_PROVIDER?.trim().toLowerCase();

  if (
    configured == null ||
    configured === '' ||
    configured === 'dev'
  ) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'OTP_PROVIDER=webhook é obrigatório em produção.',
      );
    }

    if (
      env.ALLOW_DEV_OTP === 'true' ||
      env.ALLOW_DEV_IDENTITY === 'true'
    ) {
      return new DevOtpDeliveryProvider();
    }
    return null;
  }

  if (configured === 'webhook') {
    const rawUrl = env.OTP_WEBHOOK_URL?.trim();
    const token = env.OTP_WEBHOOK_TOKEN?.trim();
    if (!rawUrl || !token || token.length < 20) {
      throw new Error(
        'OTP_WEBHOOK_URL e OTP_WEBHOOK_TOKEN são obrigatórios.',
      );
    }

    let endpoint: URL;
    try {
      endpoint = new URL(rawUrl);
    } catch {
      throw new Error('OTP_WEBHOOK_URL precisa ser uma URL válida.');
    }
    if (endpoint.protocol !== 'https:') {
      throw new Error('OTP_WEBHOOK_URL deve usar HTTPS.');
    }

    return new WebhookOtpDeliveryProvider(endpoint, token);
  }

  throw new Error('OTP_PROVIDER deve ser dev ou webhook.');
}
