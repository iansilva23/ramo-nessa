-- Additive policy snapshots. Nothing is enabled by migrations or existing rides.
CREATE TABLE ride_occurrence_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false, bonus_enabled boolean NOT NULL DEFAULT false,
 bonus_cents jsonb NOT NULL DEFAULT '{"moto":0,"car":0,"buggy":0,"delivery":0,"comfort_black":0}',
 revision integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),actor jsonb
);
INSERT INTO ride_occurrence_policy(singleton) VALUES(true);
ALTER TABLE rides ADD COLUMN occurrence_terms jsonb NOT NULL DEFAULT '{"enabled":false,"bonusEnabled":false,"bonusCents":0}';
CREATE FUNCTION snapshot_ride_occurrence_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT jsonb_build_object('enabled',enabled,'bonusEnabled',bonus_enabled,'bonusCents',COALESCE((bonus_cents->>NEW.category)::int,0),'revision',revision)
 INTO NEW.occurrence_terms FROM ride_occurrence_policy WHERE singleton=true FOR SHARE;
 RETURN NEW;
END $$;
CREATE TRIGGER rides_occurrence_terms BEFORE INSERT ON rides FOR EACH ROW EXECUTE FUNCTION snapshot_ride_occurrence_terms();
CREATE TABLE ride_occurrences (
 id uuid PRIMARY KEY,ride_id uuid NOT NULL REFERENCES rides(id),driver_id text NOT NULL,
 ticket_id uuid NOT NULL REFERENCES driver_support_tickets(id),
 kind text NOT NULL CHECK(kind IN ('refund','mechanical','dispute','cash')),
 status text NOT NULL CHECK(status IN ('awaiting_passenger','replacement_search','refund_pending','review','resolved')),
 driver_statement text NOT NULL,passenger_statement text,passenger_choice text,
 cash_received_at timestamptz,cash_returned_at timestamptz,cash_return_confirmed boolean,
 decision jsonb,revision integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ride_occurrence_open ON ride_occurrences(ride_id) WHERE status<>'resolved';
CREATE TABLE ride_occurrence_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,occurrence_id uuid REFERENCES ride_occurrences(id),
 action text NOT NULL,actor jsonb NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ride_cash_receipts (
 ride_id uuid PRIMARY KEY REFERENCES rides(id),driver_id text NOT NULL,received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ride_boarding_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,ride_id uuid NOT NULL REFERENCES rides(id),
 driver_id text,code text NOT NULL CHECK(code ~ '^[0-9]{3}$'),attempts integer NOT NULL,
 verified_at timestamptz,override_at timestamptz,archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ride_boarding_codes ADD COLUMN assignment_driver_id text;
-- Reuse the existing generator, including rejection sampling. A continuation rotates
-- only a snapshotted required code, never enables boarding for a previously exempt ride.
CREATE OR REPLACE FUNCTION snapshot_ride_boarding_code() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE active boolean;selected jsonb;digits text:='';b integer;previous text;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT enabled,categories INTO active,selected FROM ride_boarding_policy WHERE singleton=true FOR SHARE;
  active:=active AND COALESCE((selected->>NEW.category)::boolean,false);
 ELSE
  IF NEW.driver_id IS NULL OR NEW.state NOT IN ('DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED') THEN RETURN NEW;END IF;
  SELECT code INTO previous FROM ride_boarding_codes WHERE ride_id=NEW.id FOR UPDATE;
  IF previous IS NULL THEN RETURN NEW;END IF;
  IF NOT EXISTS(SELECT 1 FROM ride_occurrences WHERE ride_id=NEW.id AND status='replacement_search' AND driver_id<>NEW.driver_id) THEN
   UPDATE ride_boarding_codes SET assignment_driver_id=NEW.driver_id WHERE ride_id=NEW.id;RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM ride_boarding_codes WHERE ride_id=NEW.id AND assignment_driver_id=NEW.driver_id) THEN RETURN NEW;END IF;
  INSERT INTO ride_boarding_history(ride_id,driver_id,code,attempts,verified_at,override_at)
  SELECT ride_id,assignment_driver_id,code,attempts,verified_at,override_at FROM ride_boarding_codes WHERE ride_id=NEW.id;
  active:=true;
 END IF;
 IF active THEN
  LOOP
   digits:='';
   WHILE length(digits)<3 LOOP
    b:=get_byte(gen_random_bytes(1),0);IF b<250 THEN digits:=digits||(b%10)::text;END IF;
   END LOOP;
   EXIT WHEN previous IS NULL OR digits<>previous;
  END LOOP;
  INSERT INTO ride_boarding_codes(ride_id,code,assignment_driver_id) VALUES(NEW.id,digits,NEW.driver_id)
  ON CONFLICT(ride_id) DO UPDATE SET code=EXCLUDED.code,assignment_driver_id=EXCLUDED.assignment_driver_id,
   attempts=0,verified_at=NULL,override_at=NULL,override_actor=NULL,override_reason=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rides_boarding_continuation AFTER UPDATE OF driver_id ON rides
FOR EACH ROW WHEN(NEW.driver_id IS DISTINCT FROM OLD.driver_id) EXECUTE FUNCTION snapshot_ride_boarding_code();
ALTER TABLE rides ADD COLUMN occurrence_bonus jsonb;
CREATE TABLE ride_occurrence_penalties (
 id uuid PRIMARY KEY,occurrence_id uuid NOT NULL UNIQUE REFERENCES ride_occurrences(id),
 passenger_id text NOT NULL,injured_driver_id text NOT NULL,amount_cents integer NOT NULL CHECK(amount_cents>0 AND amount_cents<=100000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reserved','consumed','waived','review')),
 reserved_ride_id uuid REFERENCES rides(id),revision integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ride_penalty_reservation ON ride_occurrence_penalties(reserved_ride_id) WHERE reserved_ride_id IS NOT NULL AND status IN ('reserved','consumed');
CREATE FUNCTION update_ride_occurrence_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state='IN_PROGRESS' AND EXISTS(SELECT 1 FROM ride_occurrences WHERE ride_id=NEW.id AND status='replacement_search' AND driver_id<>NEW.driver_id) THEN
  UPDATE ride_occurrences SET status='resolved',revision=revision+1,updated_at=now(),decision=jsonb_build_object('action','continued','originalDriverAmountCents',0,'replacementDriverId',NEW.driver_id) WHERE ride_id=NEW.id AND status='replacement_search';
 END IF;
 IF NEW.state='REFUNDED' THEN
  UPDATE ride_occurrences SET status='resolved',revision=revision+1,updated_at=now() WHERE ride_id=NEW.id AND status='refund_pending';
 END IF;
 IF NEW.state IN ('CANCELLED_BY_PASSENGER','CANCELLED_BY_DRIVER','CANCELLED_BY_ADMIN','REFUNDED') THEN
  UPDATE ride_occurrence_penalties SET status=CASE WHEN status='consumed' THEN 'review' ELSE 'pending' END,reserved_ride_id=CASE WHEN status='consumed' THEN reserved_ride_id ELSE NULL END,revision=revision+1,updated_at=now() WHERE reserved_ride_id=NEW.id AND status IN ('reserved','consumed');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rides_occurrence_completion AFTER UPDATE OF state ON rides FOR EACH ROW WHEN(OLD.state IS DISTINCT FROM NEW.state) EXECUTE FUNCTION update_ride_occurrence_completion();
