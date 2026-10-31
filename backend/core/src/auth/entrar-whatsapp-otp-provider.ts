import type { OtpDeliveryProvider } from './otp-delivery-provider.js';
import { OtpDeliveryError } from './otp-delivery-provider.js';

// Public API contract: https://entrar.api.br/otp-whatsapp.
// The provider generates the code. Our local code is never sent to it.
export class EntrarWhatsAppOtpProvider implements OtpDeliveryProvider {
  readonly externalProvider = 'entrar-whatsapp' as const;
  constructor(private readonly secret: string) {}

  private async call(path: 'send' | 'verify', body: object): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    timeout.unref();
    try {
      const response = await fetch('https://cpf.entrar.api.br/api/otp/' + path, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.secret },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      // Do not expose upstream bodies (which can contain credentials or codes).
      if (!response.ok) throw new Error();
      const data: unknown = await response.json();
      if (data == null || typeof data !== 'object' || Array.isArray(data)) throw new Error();
      return data as Record<string, unknown>;
    } catch {
      // No automatic retry: a send may already have been billed; a successful
      // verification may already have consumed the upstream one-time code.
      throw new OtpDeliveryError('Serviço de códigos pelo WhatsApp indisponível.');
    } finally { clearTimeout(timeout); }
  }

  async sendCode(input: { phoneE164: string }): Promise<{ reference: string }> {
    const data = await this.call('send', { telefone: input.phoneE164 });
    if (data.ok !== true || data.status !== 'pending' ||
        typeof data.otpId !== 'string' || data.otpId.length === 0 ||
        data.otpId.length > 256 || /[\s\x00-\x1f]/.test(data.otpId)) {
      throw new OtpDeliveryError('Serviço de códigos pelo WhatsApp recusou o envio.');
    }
    return { reference: data.otpId };
  }

  async verifyCode(input: { reference: string; code: string }): Promise<boolean> {
    const data = await this.call('verify', { otpId: input.reference, codigo: input.code });
    return data.ok === true && data.verified === true;
  }
}
