import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import type { RideRecord } from '../rides/ride.js';
import type {
  AcceptRideOfferInput,
  CreateRideOfferInput,
  ExpireRideOfferInput,
  MarkNoDriverFoundInput,
  RejectRideOfferInput,
  RideMatchingRepository,
  RideOfferMutationResult,
} from './ride-matching-repository.js';
import {
  RideOfferError,
  type RideOfferRecord,
} from './ride-offer.js';

interface RideOfferRow {
  id: string;
  ride_id: string;
  driver_id: string;
  status: RideOfferRecord['status'];
  approximate_pickup_distance_km: string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface RideRow {
  id: string;
  passenger_id: string;
  state: RideRecord['state'];
  payment_status: RideRecord['paymentStatus'];
  driver_id: string | null;
  reserved_driver_id: string | null;
  driver_hold_expires_at: Date | null;
  pickup_latitude: string | null;
  pickup_longitude: string | null;
  dropoff_latitude: string | null;
  dropoff_longitude: string | null;
  origin_zone_id: RideRecord['origin']['zoneId'];
  origin_locality_id: string | null;
  destination_zone_id: RideRecord['destination']['zoneId'];
  destination_locality_id: string | null;
  category: RideRecord['category'];
  price_period: RideRecord['period'];
  passengers: number;
  trip_distance_km: string | null;
  driver_pickup_distance_km: string | null;
  pricing_rule_id: string;
  base_amount_cents: number;
  pickup_compensation_cents: number;
  total_amount_cents: number;
  platform_commission_cents: number;
  driver_net_cents: number;
  created_at: Date;
  updated_at: Date;
}

const RIDE_COLUMNS = `
  id, passenger_id, state, payment_status, driver_id,
  reserved_driver_id, driver_hold_expires_at,
  pickup_latitude, pickup_longitude,
  dropoff_latitude, dropoff_longitude,
  origin_zone_id, origin_locality_id,
  destination_zone_id, destination_locality_id,
  category, price_period, passengers,
  trip_distance_km, driver_pickup_distance_km,
  pricing_rule_id, base_amount_cents, pickup_compensation_cents,
  total_amount_cents, platform_commission_cents, driver_net_cents,
  created_at, updated_at
`;

const OFFER_COLUMNS = `
  id, ride_id, driver_id, status, approximate_pickup_distance_km,
  expires_at, created_at, updated_at
`;

function mapOffer(row: RideOfferRow): RideOfferRecord {
  return {
    id: row.id,
    rideId: row.ride_id,
    driverId: row.driver_id,
    status: row.status,
    approximatePickupDistanceKm:
      Number(row.approximate_pickup_distance_km),
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRide(row: RideRow): RideRecord {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    state: row.state,
    paymentStatus: row.payment_status,
    ...(row.driver_id != null ? { driverId: row.driver_id } : {}),
    ...(row.reserved_driver_id != null
      ? { reservedDriverId: row.reserved_driver_id }
      : {}),
    ...(row.driver_hold_expires_at != null
      ? { driverHoldExpiresAt: row.driver_hold_expires_at.toISOString() }
      : {}),
    ...(row.pickup_latitude != null
      ? { pickupLatitude: Number(row.pickup_latitude) }
      : {}),
    ...(row.pickup_longitude != null
      ? { pickupLongitude: Number(row.pickup_longitude) }
      : {}),
    ...(row.dropoff_latitude != null
      ? { dropoffLatitude: Number(row.dropoff_latitude) }
      : {}),
    ...(row.dropoff_longitude != null
      ? { dropoffLongitude: Number(row.dropoff_longitude) }
      : {}),
    origin: {
      zoneId: row.origin_zone_id,
      ...(row.origin_locality_id != null
        ? { localityId: row.origin_locality_id }
        : {}),
    },
    destination: {
      zoneId: row.destination_zone_id,
      ...(row.destination_locality_id != null
        ? { localityId: row.destination_locality_id }
        : {}),
    },
    category: row.category,
    period: row.price_period,
    passengers: row.passengers,
    ...(row.trip_distance_km != null
      ? { tripDistanceKm: Number(row.trip_distance_km) }
      : {}),
    ...(row.driver_pickup_distance_km != null
      ? { driverPickupDistanceKm: Number(row.driver_pickup_distance_km) }
      : {}),
    quote: {
      ruleId: row.pricing_rule_id,
      baseAmountCents: row.base_amount_cents,
      pickupCompensationCents: row.pickup_compensation_cents,
      totalAmountCents: row.total_amount_cents,
      platformCommissionCents: row.platform_commission_cents,
      driverNetCents: row.driver_net_cents,
    },
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function lockRide(
  client: PoolClient,
  rideId: string,
): Promise<RideRow | null> {
  const result = await client.query<RideRow>(
    `SELECT ${RIDE_COLUMNS} FROM rides WHERE id = $1 FOR UPDATE`,
    [rideId],
  );
  return result.rows[0] ?? null;
}

export class PostgresRideMatchingRepository
    implements RideMatchingRepository {
  constructor(private readonly pool: Pool) {}

  async findOfferById(id: string): Promise<RideOfferRecord | null> {
    const result = await this.pool.query<RideOfferRow>(
      `SELECT ${OFFER_COLUMNS}
       FROM ride_offers
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    return result.rows[0] == null ? null : mapOffer(result.rows[0]);
  }

  async findLatestOfferedForDriver(
    driverId: string,
  ): Promise<RideOfferRecord | null> {
    const result = await this.pool.query<RideOfferRow>(
      `SELECT ${OFFER_COLUMNS}
       FROM ride_offers
       WHERE driver_id = $1
         AND status = 'OFFERED'
       ORDER BY created_at DESC
       LIMIT 1`,
      [driverId],
    );
    return result.rows[0] == null ? null : mapOffer(result.rows[0]);
  }

  async listOffersForRide(rideId: string): Promise<RideOfferRecord[]> {
    const result = await this.pool.query<RideOfferRow>(
      `SELECT ${OFFER_COLUMNS}
       FROM ride_offers
       WHERE ride_id = $1
       ORDER BY created_at ASC`,
      [rideId],
    );
    return result.rows.map(mapOffer);
  }

  async createOffer(
    input: CreateRideOfferInput,
  ): Promise<RideOfferMutationResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const ride = await lockRide(client, input.rideId);
      if (
        ride == null ||
        (ride.state !== 'PAID' && ride.state !== 'SEARCHING_DRIVER')
      ) {
        throw new RideOfferError(
          'RIDE_NOT_READY',
          'Corrida não está pronta para receber oferta.',
        );
      }

      const driver = await client.query<{
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
        [input.driverId],
      );
      const driverRow = driver.rows[0];
      const activeHoldByAnotherRide =
        driverRow?.reserved_ride_id != null &&
        driverRow.reserved_until != null &&
        driverRow.reserved_until.getTime() > Date.parse(input.createdAt) &&
        driverRow.reserved_ride_id !== ride.id;
      if (
        driverRow == null ||
        !driverRow.online ||
        driverRow.busy ||
        activeHoldByAnotherRide
      ) {
        throw new RideOfferError(
          'DRIVER_NOT_AVAILABLE',
          'Motorista não está disponível para oferta.',
        );
      }

      const active = await client.query<{ id: string }>(
        `
        SELECT id
        FROM ride_offers
        WHERE ride_id = $1
          AND status = 'OFFERED'
          AND expires_at > $2
        LIMIT 1
        `,
        [input.rideId, input.createdAt],
      );
      if ((active.rowCount ?? 0) > 0) {
        throw new RideOfferError(
          'ACTIVE_OFFER_EXISTS',
          'Já existe uma oferta ativa para esta corrida.',
        );
      }

      let rideRow = ride;
      if (ride.state === 'PAID') {
        const updated = await client.query<RideRow>(
          `
          UPDATE rides
          SET state = 'SEARCHING_DRIVER', updated_at = $2
          WHERE id = $1
          RETURNING ${RIDE_COLUMNS}
          `,
          [ride.id, input.createdAt],
        );
        rideRow = updated.rows[0]!;
      }

      const offerResult = await client.query<RideOfferRow>(
        `
        INSERT INTO ride_offers (
          id, ride_id, driver_id, status,
          approximate_pickup_distance_km,
          expires_at, created_at, updated_at
        ) VALUES ($1,$2,$3,'OFFERED',$4,$5,$6,$6)
        RETURNING ${OFFER_COLUMNS}
        `,
        [
          randomUUID(),
          input.rideId,
          input.driverId,
          input.approximatePickupDistanceKm,
          input.expiresAt,
          input.createdAt,
        ],
      );

      await client.query('COMMIT');
      return {
        ride: mapRide(rideRow),
        offer: mapOffer(offerResult.rows[0]!),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async rejectOffer(
    input: RejectRideOfferInput,
  ): Promise<RideOfferRecord> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await client.query<RideOfferRow>(
        `SELECT ${OFFER_COLUMNS}
         FROM ride_offers
         WHERE id = $1
         FOR UPDATE`,
        [input.offerId],
      );
      const offer = result.rows[0];

      if (offer == null) {
        throw new RideOfferError(
          'OFFER_NOT_FOUND',
          'Oferta não encontrada.',
        );
      }
      if (offer.driver_id !== input.driverId) {
        throw new RideOfferError(
          'OFFER_DRIVER_MISMATCH',
          'Oferta pertence a outro motorista.',
        );
      }
      if (offer.status === 'REJECTED') {
        await client.query('COMMIT');
        return mapOffer(offer);
      }
      if (offer.status !== 'OFFERED') {
        throw new RideOfferError(
          'OFFER_NOT_ACTIVE',
          'Oferta não está mais ativa.',
        );
      }

      const expired =
        offer.expires_at.getTime() <= Date.parse(input.rejectedAt);
      const nextStatus = expired ? 'EXPIRED' : 'REJECTED';
      const updated = await client.query<RideOfferRow>(
        `UPDATE ride_offers
         SET status = $2, updated_at = $3
         WHERE id = $1
         RETURNING ${OFFER_COLUMNS}`,
        [offer.id, nextStatus, input.rejectedAt],
      );

      await client.query(
        `
        UPDATE driver_supply
        SET reserved_ride_id = NULL, reserved_until = NULL,
            updated_at = $3
        WHERE driver_id = $1
          AND reserved_ride_id = $2
        `,
        [offer.driver_id, offer.ride_id, input.rejectedAt],
      );

      await client.query(
        `
        UPDATE rides
        SET reserved_driver_id = NULL,
            driver_hold_expires_at = NULL,
            updated_at = $3
        WHERE id = $1
          AND reserved_driver_id = $2
        `,
        [offer.ride_id, offer.driver_id, input.rejectedAt],
      );

      await client.query('COMMIT');
      if (expired) {
        throw new RideOfferError('OFFER_EXPIRED', 'Oferta expirou.');
      }

      return mapOffer(updated.rows[0]!);
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // O caminho de oferta expirada pode já ter finalizado a transação.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async expireOffer(
    input: ExpireRideOfferInput,
  ): Promise<RideOfferRecord> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await client.query<RideOfferRow>(
        `SELECT ${OFFER_COLUMNS}
         FROM ride_offers
         WHERE id = $1
         FOR UPDATE`,
        [input.offerId],
      );
      const offer = result.rows[0];

      if (offer == null) {
        throw new RideOfferError(
          'OFFER_NOT_FOUND',
          'Oferta não encontrada.',
        );
      }
      if (offer.status === 'EXPIRED') {
        await client.query('COMMIT');
        return mapOffer(offer);
      }
      if (offer.status !== 'OFFERED') {
        throw new RideOfferError(
          'OFFER_NOT_ACTIVE',
          'Oferta não está mais ativa.',
        );
      }
      if (offer.expires_at.getTime() > Date.parse(input.expiredAt)) {
        throw new RideOfferError(
          'OFFER_NOT_EXPIRED',
          'Oferta ainda não expirou.',
        );
      }

      const updated = await client.query<RideOfferRow>(
        `UPDATE ride_offers
         SET status = 'EXPIRED', updated_at = $2
         WHERE id = $1
         RETURNING ${OFFER_COLUMNS}`,
        [offer.id, input.expiredAt],
      );

      await client.query(
        `
        UPDATE driver_supply
        SET reserved_ride_id = NULL, reserved_until = NULL,
            updated_at = $3
        WHERE driver_id = $1
          AND reserved_ride_id = $2
        `,
        [offer.driver_id, offer.ride_id, input.expiredAt],
      );

      await client.query(
        `
        UPDATE rides
        SET reserved_driver_id = NULL,
            driver_hold_expires_at = NULL,
            updated_at = $3
        WHERE id = $1
          AND reserved_driver_id = $2
        `,
        [offer.ride_id, offer.driver_id, input.expiredAt],
      );

      await client.query('COMMIT');
      return mapOffer(updated.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async markNoDriverFound(
    input: MarkNoDriverFoundInput,
  ): Promise<RideRecord> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const ride = await lockRide(client, input.rideId);
      if (
        ride == null ||
        (ride.state !== 'PAID' && ride.state !== 'SEARCHING_DRIVER')
      ) {
        throw new RideOfferError(
          'RIDE_NOT_READY',
          'Corrida não está em busca de motorista.',
        );
      }

      await client.query(
        `UPDATE ride_offers
         SET status = 'EXPIRED', updated_at = $2
         WHERE ride_id = $1
           AND status = 'OFFERED'
           AND expires_at <= $2`,
        [input.rideId, input.at],
      );

      const active = await client.query<{ id: string }>(
        `SELECT id
         FROM ride_offers
         WHERE ride_id = $1
           AND status = 'OFFERED'
           AND expires_at > $2
         LIMIT 1`,
        [input.rideId, input.at],
      );
      if ((active.rowCount ?? 0) > 0) {
        throw new RideOfferError(
          'ACTIVE_OFFER_EXISTS',
          'Ainda existe uma oferta ativa para esta corrida.',
        );
      }

      await client.query(
        `
        UPDATE driver_supply
        SET reserved_ride_id = NULL, reserved_until = NULL,
            updated_at = $2
        WHERE reserved_ride_id = $1
        `,
        [input.rideId, input.at],
      );

      const updated = await client.query<RideRow>(
        `UPDATE rides
         SET state = 'NO_DRIVER_FOUND',
             reserved_driver_id = NULL,
             driver_hold_expires_at = NULL,
             updated_at = $2
         WHERE id = $1
         RETURNING ${RIDE_COLUMNS}`,
        [input.rideId, input.at],
      );

      await client.query('COMMIT');
      return mapRide(updated.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async acceptOffer(
    input: AcceptRideOfferInput,
  ): Promise<RideOfferMutationResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const offerResult = await client.query<RideOfferRow>(
        `
        SELECT ${OFFER_COLUMNS}
        FROM ride_offers
        WHERE id = $1
        FOR UPDATE
        `,
        [input.offerId],
      );
      const offer = offerResult.rows[0];

      if (offer == null) {
        throw new RideOfferError(
          'OFFER_NOT_FOUND',
          'Oferta não encontrada.',
        );
      }
      if (offer.driver_id !== input.driverId) {
        throw new RideOfferError(
          'OFFER_DRIVER_MISMATCH',
          'Oferta pertence a outro motorista.',
        );
      }
      if (offer.status === 'ACCEPTED') {
        const acceptedRide = await lockRide(client, offer.ride_id);
        if (acceptedRide?.driver_id === input.driverId) {
          await client.query('COMMIT');
          return {
            ride: mapRide(acceptedRide),
            offer: mapOffer(offer),
          };
        }
      }
      if (offer.status !== 'OFFERED') {
        throw new RideOfferError(
          'OFFER_NOT_ACTIVE',
          'Oferta não está mais ativa.',
        );
      }
      if (offer.expires_at.getTime() <= Date.parse(input.acceptedAt)) {
        await client.query(
          `
          UPDATE ride_offers
          SET status = 'EXPIRED', updated_at = $2
          WHERE id = $1
          `,
          [offer.id, input.acceptedAt],
        );
        await client.query('COMMIT');
        throw new RideOfferError('OFFER_EXPIRED', 'Oferta expirou.');
      }

      const ride = await lockRide(client, offer.ride_id);
      if (
        ride == null ||
        ride.state !== 'SEARCHING_DRIVER' ||
        ride.driver_id != null
      ) {
        throw new RideOfferError(
          'RIDE_NOT_READY',
          'Corrida não está disponível para aceite.',
        );
      }

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
        [input.driverId],
      );
      const driver = driverResult.rows[0];
      if (driver == null || !driver.online || driver.busy) {
        throw new RideOfferError(
          'DRIVER_NOT_AVAILABLE',
          'Motorista não está mais disponível.',
        );
      }

      const updatedOffer = await client.query<RideOfferRow>(
        `
        UPDATE ride_offers
        SET status = 'ACCEPTED', updated_at = $2
        WHERE id = $1
        RETURNING ${OFFER_COLUMNS}
        `,
        [offer.id, input.acceptedAt],
      );

      const updatedRide = await client.query<RideRow>(
        `
        UPDATE rides
        SET
          state = 'DRIVER_ASSIGNED',
          driver_id = $2,
          reserved_driver_id = NULL,
          driver_hold_expires_at = NULL,
          updated_at = $3
        WHERE id = $1
        RETURNING ${RIDE_COLUMNS}
        `,
        [ride.id, input.driverId, input.acceptedAt],
      );

      await client.query(
        `
        UPDATE driver_supply
        SET busy = TRUE,
            reserved_ride_id = NULL,
            reserved_until = NULL,
            updated_at = $2
        WHERE driver_id = $1
        `,
        [input.driverId, input.acceptedAt],
      );

      await client.query(
        `
        UPDATE ride_offers
        SET status = 'CANCELLED', updated_at = $2
        WHERE ride_id = $1
          AND id <> $3
          AND status = 'OFFERED'
        `,
        [ride.id, input.acceptedAt, offer.id],
      );

      await client.query('COMMIT');
      return {
        ride: mapRide(updatedRide.rows[0]!),
        offer: mapOffer(updatedOffer.rows[0]!),
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // A transação pode já ter sido finalizada no caminho de expiração.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
