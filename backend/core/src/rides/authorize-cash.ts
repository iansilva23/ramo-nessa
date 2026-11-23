import type { FinanceRepository } from '../payments/finance-repository.js';
import type { PaymentPolicySettingsRepository } from '../payments/payment-policy-settings-repository.js';
import { assertDriverCashCapacity } from '../payments/cash-policy.js';
import { PaymentDomainError } from '../payments/payment.js';
import type { RideRepository } from './ride-repository.js';
import type { RideRecord } from './ride.js';
import {
  isRidePaymentWindowExpired,
  isRidePreparedForPayment,
} from './ride.js';
import { passengerPayableCents } from '../promotions/promotion-service.js';
import { InvalidPaymentRequestError, maxCashTenderedCents } from '../payments/validation.js';
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
  cashTenderedCents?: number;
  requestCashRide?: true;
}) {
  const now = input.now ?? new Date();
  const ride = await input.rides.findById(input.rideId);

  if (ride == null || ride.passengerId !== input.passengerId) {
    throw new PaymentDomainError(
      'PAYMENT_NOT_FOUND',
      'Corrida não encontrada para autorização cash.',
    );
  }

  if (ride.promotion != null) {
    throw new PaymentDomainError(
      'PAYMENT_METHOD_DISABLED',
      'Corridas com cupom devem ser pagas por Pix, cartão ou carteira.',
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
  const requestCashRide = input.requestCashRide === true;
  const prepared = requestCashRide ? {...ride, driverConsentRequired: false} : ride;
  if (!isRidePreparedForPayment(prepared)) {
    throw new PaymentDomainError(
      'RIDE_NOT_PREPARED',
      'Corrida precisa ser preparada antes de autorizar dinheiro.',
    );
  }
  if (isRidePaymentWindowExpired(ride, now)) {
    throw new PaymentDomainError(
      'DRIVER_HOLD_EXPIRED',
      'Reserva do motorista expirou antes da autorização cash.',
    );
  }

  const cashTenderedCents = input.cashTenderedCents;
  if (cashTenderedCents != null &&
      (!Number.isSafeInteger(cashTenderedCents) ||
        cashTenderedCents <= passengerPayableCents(ride) ||
        cashTenderedCents > maxCashTenderedCents)) {
    throw new InvalidPaymentRequestError(
      'Para pedir troco, informe um valor maior que o total da corrida.',
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
  const authorized: RideRecord = {
    ...ride,
    state,
    paymentStatus: 'authorized',
    paymentMethod: 'cash',
    ...(cashTenderedCents == null ? {} : {cashTenderedCents}),
    updatedAt: now.toISOString(),
  };
  const updated = requestCashRide
    ? await input.rides.startCashSearch(authorized)
    : await input.rides.save(authorized);
  if (updated == null) {
    const current = await input.rides.findById(ride.id);
    if (current?.paymentMethod === 'cash' && CASH_CONFIRMED_STATES.has(current.state)) {
      return {ride: current, duplicateAuthorization: true, cashPolicy};
    }
    throw new PaymentDomainError('RIDE_NOT_PREPARED', 'A busca já começou ou o prazo expirou. Volte e solicite uma nova corrida.');
  }

  return {
    ride: updated,
    duplicateAuthorization: false,
    cashPolicy,
  };
}