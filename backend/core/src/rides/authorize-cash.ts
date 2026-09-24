import type { FinanceRepository } from '../payments/finance-repository.js';
import type { PaymentPolicySettingsRepository } from '../payments/payment-policy-settings-repository.js';
import { assertDriverCashCapacity } from '../payments/cash-policy.js';
import { PaymentDomainError } from '../payments/payment.js';
import type { RideRepository } from './ride-repository.js';
import type { RideRecord } from './ride.js';
import {
  isDriverPaymentHoldExpired,
  isRidePreparedForPayment,
} from './ride.js';
import { markRidePaid } from './ride-state.js';

const CASH_CONFIRMED_STATES: ReadonlySet<RideRecord['state']> =
  new Set([
    'PAID',
    'SEARCHING_DRIVER',
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVING',
    'DRIVER_ARRIVED',
    'IN_PROGRESS',
    'COMPLETED',
    'NO_DRIVER_FOUND',
  ]);

export async function authorizeCashRide(input: {
  rides: RideRepository;
  settings: PaymentPolicySettingsRepository;
  finance: FinanceRepository;
  rideId: string;
  passengerId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const ride = await input.rides.findById(input.rideId);

  if (ride == null || ride.passengerId !== input.passengerId) {
    throw new PaymentDomainError(
      'PAYMENT_NOT_FOUND',
      'Corrida não encontrada para autorização cash.',
    );
  }

  if (
    ride.paymentMethod === 'cash' &&
    CASH_CONFIRMED_STATES.has(ride.state)
  ) {
    return {
      ride,
      duplicateAuthorization: true,
      cashPolicy: await assertDriverCashCapacity({
        settings: input.settings,
        finance: input.finance,
        driverId: ride.driverId ?? ride.reservedDriverId!,
        additionalCommissionCents: 0,
      }),
    };
  }

  if (ride.state !== 'AWAITING_PAYMENT') {
    throw new PaymentDomainError(
      'RIDE_NOT_AWAITING_PAYMENT',
      'Corrida não está aguardando forma de pagamento.',
    );
  }
  if (!isRidePreparedForPayment(ride)) {
    throw new PaymentDomainError(
      'RIDE_NOT_PREPARED',
      'Corrida precisa ser preparada antes de autorizar dinheiro.',
    );
  }
  if (isDriverPaymentHoldExpired(ride, now)) {
    throw new PaymentDomainError(
      'DRIVER_HOLD_EXPIRED',
      'Reserva do motorista expirou antes da autorização cash.',
    );
  }

  const driverId = ride.reservedDriverId!;
  const cashPolicy = await assertDriverCashCapacity({
    settings: input.settings,
    finance: input.finance,
    driverId,
    additionalCommissionCents:
      ride.quote.platformCommissionCents,
  });

  const state = markRidePaid(ride.state, {
    status: 'authorized',
    amountCents: ride.quote.totalAmountCents,
  });
  const updated = await input.rides.save({
    ...ride,
    state,
    paymentStatus: 'authorized',
    paymentMethod: 'cash',
    updatedAt: now.toISOString(),
  });

  return {
    ride: updated,
    duplicateAuthorization: false,
    cashPolicy,
  };
}
