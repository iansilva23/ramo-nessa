import type { Pool } from 'pg';
import { dispatchNextDriver } from './dispatch-next-driver.js';

/**
 * Experimental isolated recovery helper. The injected action must use the
 * existing dispatcher, re-check ride state and return true only once work is
 * safely complete. No timer or API route invokes this helper yet.
 *
 * The caller must reserve a pool connection for the action (pool capacity >= 2).
 */
export async function recoverLockedOfferDispatch(input: {
  pool: Pool;
  offerId: string;
  continueSearch: (rideId: string) => Promise<boolean>;
}): Promise<'BUSY' | 'NOT_PENDING' | 'RETRY' | 'COMPLETE'> {
  const client = await input.pool.connect();
  let lockedRideId: string | undefined;
  try {
    const marker = await client.query<{ ride_id: string }>(
      'SELECT ride_id FROM android_lock_dispatch_pending WHERE offer_id = $1',
      [input.offerId],
    );
    const rideId = marker.rows[0]?.ride_id;
    if (rideId == null) return 'NOT_PENDING';
    const lock = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 724)) AS acquired', [rideId],
    );
    if (!lock.rows[0]?.acquired) return 'BUSY';
    lockedRideId = rideId;
    // The marker may have been removed between the first read and the lock.
    const current = await client.query(
      'SELECT 1 FROM android_lock_dispatch_pending WHERE offer_id = $1 AND ride_id = $2',
      [input.offerId, rideId],
    );
    if ((current.rowCount ?? 0) === 0) return 'NOT_PENDING';
    if (!await input.continueSearch(rideId)) return 'RETRY';
    await client.query(
      'DELETE FROM android_lock_dispatch_pending WHERE offer_id = $1 AND ride_id = $2',
      [input.offerId, rideId],
    );
    return 'COMPLETE';
  } finally {
    if (lockedRideId != null) {
      try {
        await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 724))', [lockedRideId]);
      } catch {
        // Do not return a possibly locked connection to the pool.
        client.release(true);
        throw new Error('Não foi possível liberar o bloqueio da recuperação.');
      }
    }
    client.release();
  }
}

/** One recovery attempt; a scheduler must still invoke this after restart. */
export async function resumeLockedRideSearch(input: {
  pool: Pool;
  offerId: string;
  dispatch: Omit<Parameters<typeof dispatchNextDriver>[0], 'rideId' | 'pickup'>;
}): Promise<'BUSY' | 'NOT_PENDING' | 'RETRY' | 'COMPLETE'> {
  return recoverLockedOfferDispatch({
    pool: input.pool,
    offerId: input.offerId,
    continueSearch: async rideId => {
      const ride = await input.dispatch.rides.findById(rideId);
      // A missing ride is not enough proof of successful dispatch.
      if (ride == null) return false;
      if (ride.state !== 'PAID' && ride.state !== 'SEARCHING_DRIVER') return true;
      if (ride.pickupLatitude == null || ride.pickupLongitude == null) return false;
      await dispatchNextDriver({
        ...input.dispatch,
        rideId,
        pickup: {latitude: ride.pickupLatitude, longitude: ride.pickupLongitude},
      });
      return true;
    },
  });
}
