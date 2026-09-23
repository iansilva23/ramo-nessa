export class InvalidDriverFinanceRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDriverFinanceRequestError';
  }
}

export function parseDriverPayoutRequest(input: unknown): {
  amountCents: number;
} {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidDriverFinanceRequestError(
      'body deve ser um objeto.',
    );
  }

  const amountCents = (input as Record<string, unknown>).amountCents;
  if (
    typeof amountCents !== 'number' ||
    !Number.isInteger(amountCents) ||
    amountCents <= 0
  ) {
    throw new InvalidDriverFinanceRequestError(
      'amountCents deve ser inteiro positivo.',
    );
  }

  return { amountCents };
}
