-- Ranking only: stable activity facts and finished results. No financial writes.
ALTER TABLE driver_benefit_campaigns
  ADD COLUMN IF NOT EXISTS rules_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE TABLE IF NOT EXISTS driver_benefit_ride_events (
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id text NOT NULL,
  category text NOT NULL,
  state text NOT NULL CHECK (state IN ('COMPLETED', 'CANCELLED_BY_DRIVER')),
  origin_zone_id text NOT NULL,
  origin_locality_id text,
  destination_zone_id text NOT NULL,
  destination_locality_id text,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (ride_id, driver_id, state)
);
CREATE INDEX IF NOT EXISTS driver_benefit_events_ranking_idx
  ON driver_benefit_ride_events (driver_id, category, occurred_at);

-- Backfill facts that the old schema can prove. A refunded cancellation from
-- before this migration cannot be reconstructed from rides.updated_at.
INSERT INTO driver_benefit_ride_events
  (ride_id, driver_id, category, state, origin_zone_id, origin_locality_id,
   destination_zone_id, destination_locality_id, occurred_at)
SELECT id, driver_id, category, state, origin_zone_id, origin_locality_id,
       destination_zone_id, destination_locality_id, updated_at
FROM rides WHERE driver_id IS NOT NULL
  AND state IN ('COMPLETED', 'CANCELLED_BY_DRIVER')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION capture_driver_benefit_ride_event()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.driver_id IS NOT NULL AND NEW.state IN ('COMPLETED', 'CANCELLED_BY_DRIVER') THEN
    INSERT INTO driver_benefit_ride_events
      (ride_id, driver_id, category, state, origin_zone_id, origin_locality_id,
       destination_zone_id, destination_locality_id, occurred_at)
    VALUES (NEW.id, NEW.driver_id, NEW.category, NEW.state,
            NEW.origin_zone_id, NEW.origin_locality_id,
            NEW.destination_zone_id, NEW.destination_locality_id, NEW.updated_at)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS capture_driver_benefit_ride_event ON rides;
CREATE TRIGGER capture_driver_benefit_ride_event
AFTER INSERT OR UPDATE OF state, driver_id ON rides
FOR EACH ROW EXECUTE FUNCTION capture_driver_benefit_ride_event();

CREATE TABLE IF NOT EXISTS driver_benefit_results (
  campaign_id uuid PRIMARY KEY REFERENCES driver_benefit_campaigns(id) ON DELETE CASCADE,
  stats jsonb NOT NULL CHECK (jsonb_typeof(stats) = 'array'),
  finalized_at timestamptz NOT NULL
);
