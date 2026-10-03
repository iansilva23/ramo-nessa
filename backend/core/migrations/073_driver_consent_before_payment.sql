ALTER TABLE rides ADD COLUMN driver_consent_required boolean NOT NULL DEFAULT false;

-- Offers carry the price accepted by the driver. A concurrent coupon request
-- must not change that price while an offer/acceptance is active.
CREATE FUNCTION protect_driver_accepted_fare() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.driver_consent_required AND
     (NEW.total_amount_cents IS DISTINCT FROM OLD.total_amount_cents OR
      NEW.driver_net_cents IS DISTINCT FROM OLD.driver_net_cents OR
      NEW.promotion_snapshot IS DISTINCT FROM OLD.promotion_snapshot) AND
     EXISTS (SELECT 1 FROM ride_offers WHERE ride_id = OLD.id AND status IN ('OFFERED', 'ACCEPTED')) THEN
    RAISE EXCEPTION 'DRIVER_CONFIRMATION_STARTED';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_driver_accepted_fare BEFORE UPDATE ON rides
FOR EACH ROW EXECUTE FUNCTION protect_driver_accepted_fare();

ALTER TABLE operational_settings ADD COLUMN driver_search_max_distance_km numeric NOT NULL DEFAULT 5
  CHECK (driver_search_max_distance_km BETWEEN 0.5 AND 100);
