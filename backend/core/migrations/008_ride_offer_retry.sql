-- Migration 008: índice de retentativa das ofertas.

CREATE INDEX IF NOT EXISTS ride_offers_retry_idx
  ON ride_offers (ride_id, status, expires_at);
