import type {
  FinanceRepository,
  PayRideWithWalletInput,
} from './finance-repository.js';
import { passengerWalletAccountKey, WalletDomainError } from './wallet.js';

function validIdentity(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length < 3) {
    throw new WalletDomainError(
      'INVALID_PASSENGER',
      `${field} inválido.`,
    );
  }
  return normalized;
}

function validAmount(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new WalletDomainError(
      'INVALID_WALLET_AMOUNT',
      'Valor da carteira deve ser inteiro positivo em centavos.',
    );
  }
}

export async function getPassengerWalletBalance(
  repository: FinanceRepository,
  passengerId: string,
): Promise<number> {
  const id = validIdentity(passengerId, 'Passageiro');
  return repository.getAccountBalanceCents(passengerWalletAccountKey(id));
}

export async function creditPassengerWallet(
  repository: FinanceRepository,
  input: {
    passengerId: string;
    processor: string;
    processorEventId: string;
    amountCents: number;
    creditedAt?: Date;
  },
) {
  const passengerId = validIdentity(input.passengerId, 'Passageiro');
  const processor = validIdentity(input.processor, 'Processador');
  const processorEventId = validIdentity(
    input.processorEventId,
    'Evento do processador',
  );
  validAmount(input.amountCents);

  return repository.creditPassengerWallet({
    passengerId,
    processor,
    processorEventId,
    amountCents: input.amountCents,
    ...(input.creditedAt != null ? { creditedAt: input.creditedAt } : {}),
  });
}

export async function payRideUsingWallet(
  repository: FinanceRepository,
  input: PayRideWithWalletInput,
) {
  const passengerId = validIdentity(input.passengerId, 'Passageiro');
  validIdentity(input.rideId, 'Corrida');
  validIdentity(input.paymentId, 'Pagamento');
  validAmount(input.amountCents);

  return repository.payRideWithWallet({
    passengerId,
    rideId: input.rideId,
    paymentId: input.paymentId,
    amountCents: input.amountCents,
    ...(input.paidAt != null ? { paidAt: input.paidAt } : {}),
  });
}
