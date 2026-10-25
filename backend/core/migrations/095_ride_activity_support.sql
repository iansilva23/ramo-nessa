-- Persistent trip records for contextual support. Existing rides are not backfilled:
-- their old arrival time/location cannot be reconstructed reliably.
ALTER TABLE driver_support_tickets ADD COLUMN IF NOT EXISTS ride_id uuid REFERENCES rides(id);
ALTER TABLE driver_support_tickets ADD COLUMN IF NOT EXISTS ride_context jsonb;
CREATE INDEX IF NOT EXISTS support_tickets_ride_idx ON driver_support_tickets(ride_id) WHERE ride_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ride_activity_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  state text NOT NULL,
  payment_status text NOT NULL,
  driver_id text,
  driver_location jsonb
);
CREATE INDEX IF NOT EXISTS ride_activity_events_ride_idx ON ride_activity_events(ride_id, id);

CREATE OR REPLACE FUNCTION record_ride_activity_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.state IS NOT DISTINCT FROM OLD.state
       AND NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status
       AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id THEN
      RETURN NEW;
    END IF;
  END IF;
  INSERT INTO ride_activity_events(ride_id, state, payment_status, driver_id, driver_location)
  VALUES (NEW.id, NEW.state, NEW.payment_status, NEW.driver_id,
    (SELECT jsonb_build_object('latitude', latitude, 'longitude', longitude,
      'observedAt', location_updated_at, 'accuracyMeters', NULL)
     FROM driver_supply WHERE driver_id = NEW.driver_id));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rides_activity_event ON rides;
CREATE TRIGGER rides_activity_event AFTER INSERT OR UPDATE ON rides
FOR EACH ROW EXECUTE FUNCTION record_ride_activity_event();

CREATE INDEX IF NOT EXISTS rides_passenger_state_updated_idx ON rides(passenger_id, state, updated_at DESC);
