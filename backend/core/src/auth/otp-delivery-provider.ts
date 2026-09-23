export interface OtpDeliveryProvider {
  sendCode(input: {
    phoneE164: string;
    code: string;
    challengeId: string;
  }): Promise<void>;
}

export class DevOtpDeliveryProvider implements OtpDeliveryProvider {
  async sendCode(): Promise<void> {
    // Em desenvolvimento, o código volta apenas no payload do endpoint dev.
  }
}

export function resolveOtpDeliveryProviderFromEnv():
  | OtpDeliveryProvider
  | null {
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.ALLOW_DEV_IDENTITY === 'true'
  ) {
    return new DevOtpDeliveryProvider();
  }

  // Provedor real de SMS será plugado aqui sem alterar o domínio de auth.
  return null;
}
