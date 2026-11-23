ALTER TABLE ride_cancellation_terms ADD COLUMN cash_requested_at timestamptz;

CREATE FUNCTION remember_ride_cash_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ride_cancellation_terms
  SET cash_requested_at = NEW.updated_at
  WHERE ride_id = NEW.id AND cash_requested_at IS NULL;
  RETURN NEW;
END $$;

CREATE TRIGGER remember_ride_cash_request AFTER UPDATE OF payment_method ON rides
FOR EACH ROW WHEN (NEW.payment_method = 'cash' AND OLD.payment_method IS DISTINCT FROM NEW.payment_method)
EXECUTE FUNCTION remember_ride_cash_request();
