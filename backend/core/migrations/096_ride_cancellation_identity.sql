-- Preserve cancellation authorship through refund states. No backfill or policy activation.
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancellation_state text
  CHECK (cancellation_state IN ('CANCELLED_BY_DRIVER','CANCELLED_BY_PASSENGER','CANCELLED_BY_ADMIN'));
CREATE OR REPLACE FUNCTION preserve_ride_cancellation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.state IN ('CANCELLED_BY_DRIVER','CANCELLED_BY_PASSENGER','CANCELLED_BY_ADMIN','REFUND_PENDING','REFUNDED')
       AND NEW.state IN ('CREATED','AWAITING_PAYMENT','PAID','PAYMENT_FAILED') THEN
      RAISE EXCEPTION 'Corrida encerrada nao pode retornar ao checkout' USING ERRCODE = '23514';
    END IF;
    NEW.cancellation_state := OLD.cancellation_state;
  END IF;
  IF NEW.state IN ('CANCELLED_BY_DRIVER','CANCELLED_BY_PASSENGER','CANCELLED_BY_ADMIN') THEN
    NEW.cancellation_state := NEW.state;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rides_cancellation_identity ON rides;
CREATE TRIGGER rides_cancellation_identity BEFORE INSERT OR UPDATE ON rides
FOR EACH ROW EXECUTE FUNCTION preserve_ride_cancellation_identity();
