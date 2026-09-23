export class WalletDomainError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_WALLET_AMOUNT'
      | 'INVALID_PASSENGER'
      | 'WALLET_IDEMPOTENCY_CONFLICT'
      | 'INSUFFICIENT_WALLET_BALANCE'
      | 'WALLET_PAYMENT_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'WalletDomainError';
  }
}

export function passengerWalletAccountKey(passengerId: string): string {
  return `passenger:${passengerId}:wallet`;
}
