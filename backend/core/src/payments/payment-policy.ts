export const PAYMENT_POLICY_V1 = {
  cashEnabled: false,
  directDriverPixEnabled: false,
  paymentRequiredBeforeDispatch: true,
  passengerWalletEnabled: true,
  allowedMethods: ['pix', 'card', 'wallet'] as const,
  futureCashDebtLimitCents: 12000,
} as const;

export type EnabledPaymentMethod =
  (typeof PAYMENT_POLICY_V1.allowedMethods)[number];

export type RidePaymentMethod =
  | EnabledPaymentMethod
  | 'cash';

export function isPaymentMethodEnabled(
  method: string,
): method is EnabledPaymentMethod {
  return PAYMENT_POLICY_V1.allowedMethods.includes(
    method as EnabledPaymentMethod,
  );
}
