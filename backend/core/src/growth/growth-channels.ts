import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PushNotificationService } from '../notifications/push-notification-service.js';
import type { Customer } from './growth-service.js';
import type { Channel, MarketingDelivery } from './growth-model.js';
import { GrowthError } from './growth-model.js';
export function createGrowthChannels(
  push: PushNotificationService,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl = fetch,
) {
  const secret = env.MARKETING_UNSUBSCRIBE_SECRET?.trim() ?? '';
  let origin: string | null = null;
  try {
    const u = new URL(env.MARKETING_PUBLIC_BASE_URL ?? '');
    if (u.protocol === 'https:' && !u.username && !u.password)
      origin = u.origin;
  } catch {}
  const optoutReady = secret.length >= 32 && !!origin;
  const readiness = () => ({
    inapp: true,
    push: push.providerKind === 'fcm',
    email:
      optoutReady &&
      env.MARKETING_EMAIL_PROVIDER === 'resend' &&
      !!env.MARKETING_EMAIL_API_KEY?.trim() &&
      !!env.MARKETING_EMAIL_FROM?.trim(),
    whatsapp:
      optoutReady &&
      !!env.MARKETING_WHATSAPP_ACCESS_TOKEN?.trim() &&
      /^\d+$/.test(env.MARKETING_WHATSAPP_PHONE_NUMBER_ID ?? '') &&
      /^v\d+\.\d+$/.test(env.MARKETING_WHATSAPP_API_VERSION ?? '') &&
      /^[a-z0-9_]+$/.test(env.MARKETING_WHATSAPP_TEMPLATE ?? '') &&
      env.MARKETING_WHATSAPP_TEMPLATE_APPROVED === 'true',
  });
  const token = (id: string, ch: Channel) => {
    const data = Buffer.from(JSON.stringify({ id, ch })).toString('base64url');
    return `${data}.${createHmac('sha256', secret).update(data).digest('hex')}`;
  };
  function verify(value: string) {
    if (!optoutReady || value.length > 1024)
      throw new GrowthError(
        400,
        'Link indisponível. Abra as preferências no aplicativo.',
      );
    const [data, sig, extra] = value.split('.');
    if (extra !== undefined) throw new GrowthError(400, 'Link inválido.');
    if (!data || !sig || !/^[a-f0-9]{64}$/.test(sig))
      throw new GrowthError(400, 'Link inválido.');
    const expected = createHmac('sha256', secret).update(data).digest();
    if (!timingSafeEqual(Buffer.from(sig, 'hex'), expected))
      throw new GrowthError(400, 'Link inválido.');
    let payload: { id: string; ch: Channel };
    try {
      payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    } catch {
      throw new GrowthError(400, 'Link inválido.');
    }
    if (!payload || typeof payload !== 'object')
      throw new GrowthError(400, 'Link inválido.');
    if (
      typeof payload.id !== 'string' ||
      !['inapp', 'push', 'email', 'whatsapp'].includes(payload.ch)
    )
      throw new GrowthError(400, 'Link inválido.');
    return payload;
  }
  async function send(
    ch: Channel,
    u: Customer,
    d: MarketingDelivery,
    coupon: string | null,
  ): Promise<'published' | 'accepted' | 'failed'> {
    if (!readiness()[ch]) return 'failed';
    if (ch === 'inapp') return 'published';
    const body = `${d.message}${coupon ? `\nSeu cupom pessoal: ${coupon}. Confira validade e condições em Meus benefícios.` : ''}`;
    if (ch === 'push') {
      const result = await push.notifySubject({
        subjectType: 'passenger',
        subjectId: d.passengerId,
        message: {
          type: 'marketing.benefit',
          title: d.title,
          body,
          data: {
            deliveryId: d.id,
            screen: 'benefits',
            ...(coupon ? { coupon } : {}),
          },
        },
      });
      return result.delivered > 0 ? 'accepted' : 'failed';
    }
    const unsubscribe = `${origin}/v1/marketing/unsubscribe?token=${encodeURIComponent(token(d.passengerId, ch))}`;
    const options = {
      signal: AbortSignal.timeout(15000),
      redirect: 'error' as const,
    };
    if (ch === 'email') {
      const result = await fetchImpl('https://api.resend.com/emails', {
        ...options,
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.MARKETING_EMAIL_API_KEY}`,
          'content-type': 'application/json',
          'Idempotency-Key': `marketing/${d.id}/email`,
        },
        body: JSON.stringify({
          from: env.MARKETING_EMAIL_FROM,
          to: [u.identity.emailNormalized],
          subject: d.title,
          text: `${body}\n\nPara parar de receber promoções: ${unsubscribe}`,
          headers: {
            'List-Unsubscribe': `<${unsubscribe}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      });
      return result.ok ? 'accepted' : 'failed';
    }
    const result = await fetchImpl(
      `https://graph.facebook.com/${env.MARKETING_WHATSAPP_API_VERSION}/${env.MARKETING_WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        ...options,
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.MARKETING_WHATSAPP_ACCESS_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: u.identity.phoneE164.replace(/\D/g, ''),
          type: 'template',
          template: {
            name: env.MARKETING_WHATSAPP_TEMPLATE,
            language: { code: 'pt_BR' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: d.title },
                  { type: 'text', text: body },
                  { type: 'text', text: unsubscribe },
                ],
              },
            ],
          },
        }),
      },
    );
    return result.ok ? 'accepted' : 'failed';
  }
  return { readiness, send, verify };
}
