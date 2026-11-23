export type RecoveryChannel = 'email' | 'whatsapp';

export class RecoveryProviderError extends Error {}

export interface RecoveryDelivery {
  dailyLimit: number;
  send(input: { id: string; destination: string; code: string }): Promise<string | null>;
  verify?: (reference: string, code: string) => Promise<boolean>;
}

async function post(
  url: string,
  key: string,
  body: object,
  options: { idempotencyKey?: string; verifying?: boolean } = {},
): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + key,
        ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
    if (options.verifying && [400, 404, 410, 422].includes(response.status)) return { verified: false };
    if (!response.ok) throw new Error('Recovery provider unavailable');
    return await response.json() as Record<string, unknown>;
  } catch {
    throw new RecoveryProviderError('Recovery provider unavailable');
  }
}

function dailyLimit(value: string | undefined, fallback: number) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 && limit <= 1_000_000 ? limit : fallback;
}

export function recoveryDeliveryFromEnv(env: NodeJS.ProcessEnv): Partial<Record<RecoveryChannel, RecoveryDelivery>> {
  const deliveries: Partial<Record<RecoveryChannel, RecoveryDelivery>> = {};
  const resend = env.RESEND_API_KEY?.trim();
  const from = env.PASSWORD_RECOVERY_EMAIL_FROM?.trim();
  if (resend && from) {
    deliveries.email = {
      dailyLimit: dailyLimit(env.PASSWORD_RECOVERY_EMAIL_DAILY_LIMIT, 80),
      async send({ id, destination, code }) {
        const data = await post('https://api.resend.com/emails', resend, {
          from,
          to: [destination],
          subject: 'Seu código do Ramo Nessa',
          text: `Seu código do Ramo Nessa é ${code}. Ele vale por 5 minutos. Nunca compartilhe este código. Se você não solicitou, ignore este e-mail.`,
        }, { idempotencyKey: id });
        if (typeof data.id !== 'string' || !data.id) throw new Error('Email not accepted');
        return null;
      },
    };
  }
  const entrar = env.PASSWORD_RECOVERY_ENTRAR_API_SECRET?.trim();
  if (entrar) {
    const base = 'https://cpf.entrar.api.br/api/otp/';
    deliveries.whatsapp = {
      dailyLimit: dailyLimit(env.PASSWORD_RECOVERY_WHATSAPP_DAILY_LIMIT, 50),
      async send({ destination }) {
        const data = await post(base + 'send', entrar, { telefone: destination });
        if (data.ok !== true || data.status !== 'pending' ||
            typeof data.otpId !== 'string' || !/^[^\s\x00-\x1f]{1,256}$/.test(data.otpId)) {
          throw new Error('WhatsApp not accepted');
        }
        return data.otpId;
      },
      async verify(reference, code) {
        const data = await post(base + 'verify', entrar, { otpId: reference, codigo: code }, { verifying: true });
        return data.ok === true && data.verified === true;
      },
    };
  }
  return deliveries;
}
