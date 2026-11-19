-- Preserve all historical deadlines. Only newly prepared passenger rides opt in.
ALTER TABLE rides ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz;
