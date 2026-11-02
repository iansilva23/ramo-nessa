import { EntrarWhatsAppOtpProvider } from './entrar-whatsapp-otp-provider.js';

export interface OtpDeliveryProvider {
  readonly exposesCodeForDevelopment?: boolean;
  readonly externalProvider?: 'entrar-whatsapp';
  verifyCode?(input: { reference: string; code: string }): Promise<boolean>;

  sendCode(input: {
    phoneE164: string;
    code: string;
    challengeId: string;
    expiresInSeconds: number;
  }): Promise<void | { reference: string }>;
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

const OTP_WEBHOOK_MAX_ATTEMPTS = 3;
const OTP_WEBHOOK_ATTEMPT_TIMEOUT_MS = 2500;
const OTP_WEBHOOK_RETRY_DELAYS_MS = [100, 250] as const;

function retryableOtpStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

async function waitForOtpRetry(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
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
    const body = JSON.stringify(input);

    for (
      let attempt = 1;
      attempt <= OTP_WEBHOOK_MAX_ATTEMPTS;
      attempt += 1
    ) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        OTP_WEBHOOK_ATTEMPT_TIMEOUT_MS,
      );
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
          body,
          signal: controller.signal,
        });

        if (response.ok) return;

        if (
          !retryableOtpStatus(response.status) ||
          attempt === OTP_WEBHOOK_MAX_ATTEMPTS
        ) {
          throw new OtpDeliveryError(
            `Provider OTP recusou o envio com HTTP ${response.status}.`,
          );
        }
      } catch (error) {
        if (error instanceof OtpDeliveryError) throw error;
        if (attempt === OTP_WEBHOOK_MAX_ATTEMPTS) {
          throw new OtpDeliveryError(
            'Provider OTP está indisponível.',
          );
        }
      } finally {
        clearTimeout(timeout);
      }

      const retryDelay =
        OTP_WEBHOOK_RETRY_DELAYS_MS[attempt - 1] ?? 0;
      if (retryDelay > 0) {
        await waitForOtpRetry(retryDelay);
      }
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
        'OTP_PROVIDER=webhook ou entrar-whatsapp é obrigatório em produção.',
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

  if (configured === 'entrar-whatsapp') {
    const secret = env.ENTRAR_API_SECRET?.trim() ?? '';
    if (!secret || /[\s\x00-\x1f]/.test(secret)) {
      throw new Error('ENTRAR_API_SECRET precisa ser configurado apenas no servidor.');
    }
    return new EntrarWhatsAppOtpProvider(secret);
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

  throw new Error('OTP_PROVIDER deve ser dev, webhook ou entrar-whatsapp.');
}
