import { randomUUID } from 'node:crypto';

import type { RideMatchingRepository } from '../matching/ride-matching-repository.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import type { PaymentRecord } from '../payments/payment.js';
import { notifyDefaultPushSubject } from '../notifications/push-notification-service.js';
import type { RideRepository } from '../rides/ride-repository.js';
import { transitionRide } from '../rides/ride-state.js';
import type { RideRecord } from '../rides/ride.js';
import type { AdminActor, AdminRepository } from './admin-repository.js';

export class AdminRideCancellationError extends Error {
  constructor(
    public readonly code:
      | 'RIDE_NOT_FOUND'
      | 'INVALID_CANCELLATION_REASON'
      | 'ADMIN_CANCELLATION_NOT_ALLOWED'
      | 'RIDE_PAYMENT_NOT_FOUND'
      | 'RIDE_PAYMENT_NOT_REFUNDABLE',
    message: string,
  ) {
    super(message);
    this.name = 'AdminRideCancellationError';
  }
}

const ADMIN_CANCELLABLE_STATES = new Set<RideRecord['state']>([
  'PAID',
  'SEARCHING_DRIVER',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
]);

function normalizeReason(value: string): string {
  const reason = value.trim().replace(/\s+/g, ' ');
  if (reason.length < 3 || reason.length > 500) {
    throw new AdminRideCancellationError(
      'INVALID_CANCELLATION_REASON',
      'Motivo do cancelamento deve ter entre 3 e 500 caracteres.',
    );
  }
  return reason;
}

function cancellationResult(input: {
  ride: RideRecord;
  payment: PaymentRecord;
  duplicateCancellation: boolean;
  refundStatus: 'refunded' | 'pending_external_gateway';
}) {
  return {
    ride: input.ride,
    payment: {
      id: input.payment.id,
      method: input.payment.method,
      status: input.payment.status,
      amountCents: input.payment.amountCents,
    },
    duplicateCancellation: input.duplicateCancellation,
    refundStatus: input.refundStatus,
  };
}

export async function cancelRideFromAdmin(input: {
  rides: RideRepository;
  matching: RideMatchingRepository;
  finance: FinanceRepository;
  admin: AdminRepository;
  actor: AdminActor;
  rideId: string;
  reason: string;
  now?: Date;
}) {
  const reason = normalizeReason(input.reason);
  const now = input.now ?? new Date();
  const instant = now.toISOString();

  let ride = await input.rides.findById(input.rideId);
  if (ride == null) {
    throw new AdminRideCancellationError(
      'RIDE_NOT_FOUND',
      'Corrida não encontrada.',
    );
  }

  if (ride.state === 'IN_PROGRESS') {
    throw new AdminRideCancellationError(
      'ADMIN_CANCELLATION_NOT_ALLOWED',
      'Corrida já iniciada exige política de compensação antes de cancelamento administrativo.',
    );
  }

  const retryState =
    ride.state === 'CANCELLED_BY_ADMIN' ||
    ride.state === 'REFUND_PENDING' ||
    ride.state === 'REFUNDED';

  if (!retryState && !ADMIN_CANCELLABLE_STATES.has(ride.state)) {
    throw new AdminRideCancellationError(
      'ADMIN_CANCELLATION_NOT_ALLOWED',
      `Corrida em estado ${ride.state} não pode ser cancelada pelo Admin.`,
    );
  }

  let payment = await input.finance.findLatestPaymentByRideId(ride.id);
  if (payment == null) {
    throw new AdminRideCancellationError(
      'RIDE_PAYMENT_NOT_FOUND',
      'Pagamento da corrida não foi encontrado.',
    );
  }

  if (payment.status !== 'paid' && payment.status !== 'refunded') {
    throw new AdminRideCancellationError(
      'RIDE_PAYMENT_NOT_REFUNDABLE',
      `Pagamento em estado ${payment.status} não pode seguir pelo cancelamento administrativo.`,
    );
  }

  if (ride.state === 'REFUNDED') {
    if (payment.status !== 'refunded') {
      throw new AdminRideCancellationError(
        'RIDE_PAYMENT_NOT_REFUNDABLE',
        'Corrida reembolsada possui pagamento inconsistente.',
      );
    }
    return cancellationResult({
      ride,
      payment,
      duplicateCancellation: true,
      refundStatus: 'refunded',
    });
  }

  let duplicateCancellation = retryState;
  let cancelledOffers = 0;
  let releasedDriverId: string | null =
    ride.driverId ?? ride.reservedDriverId ?? null;
  const previousState = ride.state;

  if (!retryState) {
    const operational = await input.matching.cancelRideByAdmin({
      rideId: ride.id,
      cancelledAt: instant,
    });
    ride = operational.ride;
    duplicateCancellation = operational.alreadyCancelled;
    cancelledOffers = operational.cancelledOffers;
    releasedDriverId = operational.releasedDriverId;
  }

  if (ride.state === 'CANCELLED_BY_ADMIN') {
    ride = await input.rides.save({
      ...ride,
      state: transitionRide(ride.state, 'REFUND_PENDING'),
      updatedAt: instant,
    });
  }

  if (payment.status === 'refunded') {
    if (ride.state !== 'REFUND_PENDING') {
      throw new AdminRideCancellationError(
        'RIDE_PAYMENT_NOT_REFUNDABLE',
        'Pagamento já estornado, mas corrida não está pronta para finalizar o reembolso.',
      );
    }
    ride = await input.rides.save({
      ...ride,
      state: transitionRide(ride.state, 'REFUNDED'),
      paymentStatus: 'refunded',
      updatedAt: instant,
    });
  } else if (payment.method === 'wallet') {
    const refund = await input.finance.refundWalletRide({
      paymentId: payment.id,
      passengerId: ride.passengerId,
      refundedAt: now,
    });
    payment = refund.payment;

    const latest = (await input.rides.findById(ride.id)) ?? ride;
    if (latest.state === 'REFUND_PENDING') {
      ride = await input.rides.save({
        ...latest,
        state: transitionRide(latest.state, 'REFUNDED'),
        paymentStatus: payment.status,
        updatedAt: instant,
      });
    } else if (latest.state === 'REFUNDED') {
      ride = latest;
    } else {
      throw new AdminRideCancellationError(
        'RIDE_PAYMENT_NOT_REFUNDABLE',
        `Corrida em estado ${latest.state} não pode finalizar o estorno.`,
      );
    }
  }

  const refundStatus =
    ride.state === 'REFUNDED'
      ? 'refunded'
      : 'pending_external_gateway';

  if (!duplicateCancellation) {
    notifyDefaultPushSubject({
      subjectType: 'passenger',
      subjectId: ride.passengerId,
      message: {
        type: 'passenger.ride.cancelled_by_admin',
        title: 'Corrida cancelada',
        body:
          refundStatus === 'refunded'
            ? 'Sua corrida foi cancelada e o valor foi estornado.'
            : 'Sua corrida foi cancelada. O estorno está em processamento.',
        data: { rideId: ride.id },
      },
    });

    if (releasedDriverId != null) {
      notifyDefaultPushSubject({
        subjectType: 'driver',
        subjectId: releasedDriverId,
        message: {
          type: 'driver.ride.cancelled_by_admin',
          title: 'Corrida cancelada',
          body: 'Esta corrida foi cancelada pelo suporte.',
          data: { rideId: ride.id },
        },
      });
    }

    await input.admin.appendAudit({
      id: randomUUID(),
      actor: input.actor,
      action: 'ride.cancelled_by_admin',
      targetType: 'ride',
      targetId: ride.id,
      metadata: {
        reason,
        previousState,
        finalState: ride.state,
        paymentMethod: payment.method,
        refundStatus,
        cancelledOffers,
        releasedDriverId,
      },
      createdAt: instant,
    });
  }

  return cancellationResult({
    ride,
    payment,
    duplicateCancellation,
    refundStatus,
  });
}
