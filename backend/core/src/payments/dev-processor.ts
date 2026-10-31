import type { EnabledPaymentMethod } from './payment-policy.js';

export class PaymentProcessorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentProcessorUnavailableError';
  }
}

export function resolvePaymentProcessor(
  method: EnabledPaymentMethod,
): string {
  if (process.env.NODE_ENV === 'production') {
    throw new PaymentProcessorUnavailableError(
      'Gateway real ainda não está configurado para produção.',
    );
  }

  if (process.env.ALLOW_DEV_PAYMENT_GATEWAY !== 'true') {
    throw new PaymentProcessorUnavailableError(
      'Simulador de pagamento está desativado.',
    );
  }

  return method === 'wallet' ? 'dev-wallet' : 'dev-payment-simulator';
}
