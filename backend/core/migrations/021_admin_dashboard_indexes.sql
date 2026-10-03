-- Migration 021: índices para dashboard operacional do Admin.

CREATE INDEX IF NOT EXISTS rides_updated_idx
  ON rides (updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS rides_state_updated_idx
  ON rides (state, updated_at DESC, id DESC);
