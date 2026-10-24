-- Additive only: preserve existing rides, money, credentials and pricing.
CREATE TABLE ride_cancellation_policy (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), revision integer NOT NULL DEFAULT 0, rules jsonb NOT NULL
);
INSERT INTO ride_cancellation_policy(id,rules)
SELECT true,jsonb_object_agg(c,jsonb_build_object('enabled',false,'freeSeconds',40,'feeCents',null))
FROM unnest(ARRAY['moto','car','buggy','delivery','comfort_black']) c;

ALTER TABLE rides ADD COLUMN manual_refund boolean NOT NULL DEFAULT false;
CREATE TABLE ride_cancellation_terms (
 ride_id uuid PRIMARY KEY REFERENCES rides(id) ON DELETE CASCADE, rule jsonb NOT NULL, accepted_at timestamptz
);
CREATE FUNCTION snapshot_ride_cancellation_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO ride_cancellation_terms(ride_id,rule)
 SELECT NEW.id,rules->NEW.category FROM ride_cancellation_policy WHERE id=true;
 RETURN NEW;
END $$;
CREATE TRIGGER snapshot_ride_cancellation_terms AFTER INSERT ON rides FOR EACH ROW EXECUTE FUNCTION snapshot_ride_cancellation_terms();
-- Legacy rides remain fee-free; never apply newly configured fees retroactively.
INSERT INTO ride_cancellation_terms(ride_id,rule)
SELECT id,jsonb_build_object('enabled',false,'freeSeconds',40,'feeCents',null) FROM rides;

CREATE FUNCTION remember_ride_driver_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='ACCEPTED' THEN
  UPDATE ride_cancellation_terms SET accepted_at=COALESCE(accepted_at,NEW.updated_at) WHERE ride_id=NEW.ride_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER remember_ride_driver_acceptance AFTER UPDATE OF status ON ride_offers FOR EACH ROW EXECUTE FUNCTION remember_ride_driver_acceptance();
UPDATE ride_cancellation_terms t SET accepted_at=o.accepted_at
FROM (SELECT ride_id,MIN(updated_at) accepted_at FROM ride_offers WHERE status='ACCEPTED' GROUP BY ride_id) o WHERE t.ride_id=o.ride_id;

CREATE TABLE ride_manual_cancellations (
 ride_id uuid PRIMARY KEY REFERENCES rides(id), passenger_id text NOT NULL, driver_id text,
 payment_id uuid REFERENCES payments(id), paid_cents integer NOT NULL CHECK(paid_cents>=0),
 credited_fee_cents integer NOT NULL CHECK(credited_fee_cents>=0 AND credited_fee_cents<=paid_cents),
 fee_cents integer NOT NULL CHECK(fee_cents>=0 AND fee_cents<=credited_fee_cents),
 status text NOT NULL CHECK(status IN ('awaiting_pix','review','approved','refunded')),
 reason text NOT NULL, pix jsonb, receipt jsonb, bank_reference text,
 revision integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 reviewed_by text, reviewed_at timestamptz, refunded_at timestamptz
);
CREATE UNIQUE INDEX manual_cancellation_bank_reference ON ride_manual_cancellations(bank_reference) WHERE bank_reference IS NOT NULL;
CREATE TABLE ride_manual_cancellation_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ride_id uuid REFERENCES rides(id),
 actor text NOT NULL, action text NOT NULL, metadata jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION protect_manually_cancelled_ride() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.manual_refund AND NEW.state NOT IN ('CANCELLED_BY_PASSENGER','CANCELLED_BY_ADMIN','REFUND_PENDING','REFUNDED') THEN
  RAISE EXCEPTION 'Corrida sob devolucao manual nao pode ser reativada';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_manually_cancelled_ride BEFORE UPDATE ON rides FOR EACH ROW EXECUTE FUNCTION protect_manually_cancelled_ride();
