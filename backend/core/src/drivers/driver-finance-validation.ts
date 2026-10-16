import type { PixKeyType } from '../payments/payout.js';

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

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function allSameDigits(value: string): boolean {
  return /^(\d)\1+$/.test(value);
}

function cpfValid(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || allSameDigits(cpf)) return false;

  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index++) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return digit(9) === Number(cpf[9]) &&
    digit(10) === Number(cpf[10]);
}

function cnpjValid(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || allSameDigits(cnpj)) return false;

  const calculate = (baseLength: number) => {
    const weights =
      baseLength === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce(
      (total, weight, index) =>
        total + Number(cnpj[index]) * weight,
      0,
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculate(12) === Number(cnpj[12]) &&
    calculate(13) === Number(cnpj[13]);
}

export function parseDriverPayoutDestinationRequest(input: unknown): {
  pixKeyType: PixKeyType;
  pixKey: string;
} {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidDriverFinanceRequestError(
      'Dados da chave Pix devem ser um objeto.',
    );
  }

  const value = input as Record<string, unknown>;
  const pixKeyType = value.pixKeyType;
  const rawKey =
    typeof value.pixKey === 'string' ? value.pixKey.trim() : '';

  if (
    pixKeyType !== 'cpf' &&
    pixKeyType !== 'cnpj' &&
    pixKeyType !== 'email' &&
    pixKeyType !== 'phone' &&
    pixKeyType !== 'random'
  ) {
    throw new InvalidDriverFinanceRequestError(
      'Tipo de chave Pix inválido.',
    );
  }

  if (rawKey.length < 3 || rawKey.length > 160) {
    throw new InvalidDriverFinanceRequestError(
      'Chave Pix possui tamanho inválido.',
    );
  }

  if (pixKeyType === 'cpf') {
    const pixKey = onlyDigits(rawKey);
    if (!cpfValid(pixKey)) {
      throw new InvalidDriverFinanceRequestError('CPF da chave Pix inválido.');
    }
    return { pixKeyType, pixKey };
  }

  if (pixKeyType === 'cnpj') {
    const pixKey = onlyDigits(rawKey);
    if (!cnpjValid(pixKey)) {
      throw new InvalidDriverFinanceRequestError('CNPJ da chave Pix inválido.');
    }
    return { pixKeyType, pixKey };
  }

  if (pixKeyType === 'email') {
    const pixKey = rawKey.toLowerCase();
    if (
      pixKey.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pixKey)
    ) {
      throw new InvalidDriverFinanceRequestError(
        'E-mail da chave Pix inválido.',
      );
    }
    return { pixKeyType, pixKey };
  }

  if (pixKeyType === 'phone') {
    const digits = onlyDigits(rawKey);
    const national =
      digits.startsWith('55') && digits.length >= 12
        ? digits.substring(2)
        : digits;
    if (national.length < 10 || national.length > 11) {
      throw new InvalidDriverFinanceRequestError(
        'Celular da chave Pix inválido.',
      );
    }
    return { pixKeyType, pixKey: `+55${national}` };
  }

  const pixKey = rawKey.toLowerCase();
  if (
    pixKey.length < 32 ||
    pixKey.length > 77 ||
    !/^[a-z0-9-]+$/.test(pixKey)
  ) {
    throw new InvalidDriverFinanceRequestError(
      'Chave Pix aleatória inválida.',
    );
  }
  return { pixKeyType, pixKey };
}
