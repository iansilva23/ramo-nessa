export class InvalidWalletRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWalletRequestError';
  }
}

export interface CreateWalletTopupRequest {
  method: 'pix';
  amountCents: number;
  payerEmail?: string;
}

function parseEmail(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') {
    throw new InvalidWalletRequestError(
      'payerEmail deve ser um e-mail válido.',
    );
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 5 ||
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new InvalidWalletRequestError(
      'Informe um e-mail válido para recarregar a carteira.',
    );
  }
  return normalized;
}

export function parseCreateWalletTopupRequest(
  input: unknown,
): CreateWalletTopupRequest {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidWalletRequestError('body deve ser um objeto.');
  }

  const record = input as Record<string, unknown>;
  const method = record.method;
  const amountCents = record.amountCents;

  if (method !== 'pix') {
    throw new InvalidWalletRequestError(
      'A Carteira Ramo Nessa aceita recarga somente por Pix.',
    );
  }

  if (
    typeof amountCents !== 'number' ||
    !Number.isInteger(amountCents) ||
    amountCents < 100 ||
    amountCents > 1_000_000
  ) {
    throw new InvalidWalletRequestError(
      'amountCents deve ser inteiro entre 100 e 1000000.',
    );
  }

  const payerEmail = parseEmail(record.payerEmail);

  return {
    method: 'pix',
    amountCents,
    ...(payerEmail == null ? {} : { payerEmail }),
  };
}
