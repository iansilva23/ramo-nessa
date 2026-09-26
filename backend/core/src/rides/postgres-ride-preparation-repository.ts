import type { Pool } from 'pg';

import {
  RidePreparationRepositoryError,
  type RidePreparationRepository,
} from './ride-preparation-repository.js';
import type { RideRecord } from './ride.js';

export class PostgresRidePreparationRepository
    implements RidePreparationRepository {
  constructor(private readonly pool: Pool) {}

  async reserveDriverAndCreateRide(input: {
    ride: RideRecord;
    preparedAt: string;
  }): Promise<RideRecord> {
    const driverId = input.ride.reservedDriverId;
    const holdExpiresAt = input.ride.driverHoldExpiresAt;

    if (driverId == null || holdExpiresAt == null) {
      throw new RidePreparationRepositoryError(
        'INVALID_HOLD',
        'Corrida preparada precisa de motorista e validade da reserva.',
      );
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const driverResult = await client.query<{
        online: boolean;
        busy: boolean;
        reserved_ride_id: string | null;
        reserved_until: Date | null;
      }>(
        `
        SELECT online, busy, reserved_ride_id, reserved_until
        FROM driver_supply
        WHERE driver_id = $1
        FOR UPDATE
        `,
        [driverId],
      );
      const driver = driverResult.rows[0];
      const preparedAtMs = Date.parse(input.preparedAt);
      const activeReservation =
        driver?.reserved_ride_id != null &&
        driver.reserved_until != null &&
        driver.reserved_until.getTime() > preparedAtMs &&
        driver.reserved_ride_id !== input.ride.id;

      if (
        driver == null ||
        !driver.online ||
        driver.busy ||
        activeReservation
      ) {
        throw new RidePreparationRepositoryError(
          'DRIVER_NOT_AVAILABLE',
          'Motorista não está disponível para reserva de pagamento.',
        );
      }

      const ride = input.ride;
      await client.query(
        `
        INSERT INTO rides (
          id, passenger_id, state, payment_status, payment_method, driver_id,
          reserved_driver_id, driver_hold_expires_at,
          pickup_latitude, pickup_longitude,
          dropoff_latitude, dropoff_longitude,
          origin_zone_id, origin_locality_id,
          destination_zone_id, destination_locality_id,
          category, requires_four_by_four, price_period, passengers,
          trip_distance_km, driver_pickup_distance_km,
          pricing_rule_id, pricing_catalog_label,
          pricing_catalog_version_id, pricing_catalog_version_number,
          base_amount_cents, pickup_compensation_cents,
          total_amount_cents, platform_commission_cents, driver_net_cents,
          created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
          $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33
        )
        `,
        [
          ride.id,
          ride.passengerId,
          ride.state,
          ride.paymentStatus,
          ride.paymentMethod ?? null,
          ride.driverId ?? null,
          driverId,
          holdExpiresAt,
          ride.pickupLatitude ?? null,
          ride.pickupLongitude ?? null,
          ride.dropoffLatitude ?? null,
          ride.dropoffLongitude ?? null,
          ride.origin.zoneId,
          ride.origin.localityId ?? null,
          ride.destination.zoneId,
          ride.destination.localityId ?? null,
          ride.category,
          ride.requiresFourByFour ?? false,
          ride.period,
          ride.passengers,
          ride.tripDistanceKm ?? null,
          ride.driverPickupDistanceKm ?? null,
          ride.quote.ruleId,
          ride.quote.catalogVersion ?? 'v1',
          ride.quote.catalogVersionId ?? null,
          ride.quote.catalogVersionNumber ?? null,
          ride.quote.baseAmountCents,
          ride.quote.pickupCompensationCents,
          ride.quote.totalAmountCents,
          ride.quote.platformCommissionCents,
          ride.quote.driverNetCents,
          ride.createdAt,
          ride.updatedAt,
        ],
      );

      await client.query(
        `
        UPDATE driver_supply
        SET
          reserved_ride_id = $2,
          reserved_until = $3,
          updated_at = $4
        WHERE driver_id = $1
        `,
        [driverId, ride.id, holdExpiresAt, input.preparedAt],
      );

      await client.query('COMMIT');
      return structuredClone(ride);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
