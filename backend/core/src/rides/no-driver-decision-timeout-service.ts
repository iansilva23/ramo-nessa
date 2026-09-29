import type { OperationalSettingsRepository } from '../config/operational-settings-repository.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import type { MercadoPagoOrdersClient } from '../payments/mercado-pago-orders.js';
import { automaticallyRefundRide } from './automatic-ride-refund-service.js';
import { cancelPassengerRideAfterNoDriver } from './passenger-ride-recovery-service.js';
import type { RideRepository } from './ride-repository.js';

export interface ExpiredNoDriverDecisionResult {
  rideId: string;
  passengerId: string;
  refundStatus: 'refunded' | 'pending_external_gateway' | 'not_charged';
}

export async function expireNoDriverDecisions(input: {
  rides: RideRepository;
  finance: FinanceRepository;
  operationalSettings: OperationalSettingsRepository;
  gateway: MercadoPagoOrdersClient | null;
  now?: Date;
  limit?: number;
}): Promise<ExpiredNoDriverDecisionResult[]> {
  const now = input.now ?? new Date();
  const settings = await input.operationalSettings.get();
  const cutoff = new Date(
    now.getTime() - settings.noDriverDecisionTimeoutSeconds * 1000,
  ).toISOString();
  const stale = await input.rides.listNoDriverFoundBefore(
    cutoff,
    input.limit ?? 100,
  );

  const results: ExpiredNoDriverDecisionResult[] = [];
  for (const ride of stale) {
    const latest = await input.rides.findById(ride.id);
    if (latest?.state !== 'NO_DRIVER_FOUND') continue;

    const cancelled = await cancelPassengerRideAfterNoDriver({
      rides: input.rides,
      passengerId: latest.passengerId,
      rideId: latest.id,
      now,
    });
    const refund = await automaticallyRefundRide({
      rides: input.rides,
      finance: input.finance,
      gateway: input.gateway,
      rideId: cancelled.id,
      passengerId: cancelled.passengerId,
      now,
    });
    results.push({
      rideId: refund.ride.id,
      passengerId: refund.ride.passengerId,
      refundStatus: refund.refundStatus,
    });
  }
  return results;
}


export async function reconcilePendingRideRefunds(input: {
  rides: RideRepository;
  finance: FinanceRepository;
  gateway: MercadoPagoOrdersClient | null;
  now?: Date;
  limit?: number;
}): Promise<ExpiredNoDriverDecisionResult[]> {
  if (input.gateway == null) return [];

  const now = input.now ?? new Date();
  const pending = await input.rides.listRefundPendingBefore(
    now.toISOString(),
    input.limit ?? 100,
  );
  const results: ExpiredNoDriverDecisionResult[] = [];

  for (const ride of pending) {
    const latest = await input.rides.findById(ride.id);
    if (latest?.state !== 'REFUND_PENDING') continue;

    const refund = await automaticallyRefundRide({
      rides: input.rides,
      finance: input.finance,
      gateway: input.gateway,
      rideId: latest.id,
      passengerId: latest.passengerId,
      now,
    });
    results.push({
      rideId: refund.ride.id,
      passengerId: refund.ride.passengerId,
      refundStatus: refund.refundStatus,
    });
  }
  return results;
}
