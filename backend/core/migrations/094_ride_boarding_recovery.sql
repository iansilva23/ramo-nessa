-- Disabled by default. Only NEW rides snapshot the policy; existing rides are preserved.
CREATE TABLE IF NOT EXISTS ride_boarding_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 categories jsonb NOT NULL DEFAULT '{"moto":true,"car":true,"buggy":true,"delivery":true,"comfort_black":true}',
 revision integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by jsonb
);
INSERT INTO ride_boarding_policy(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS ride_boarding_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ride_id uuid REFERENCES rides(id),
 action text NOT NULL,
 actor jsonb NOT NULL,
 details jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ride_boarding_codes (
 ride_id uuid PRIMARY KEY REFERENCES rides(id),
 code text NOT NULL CHECK(code ~ '^[0-9]{3}$'),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 verified_at timestamptz,
 override_reason text,
 override_actor jsonb,
 override_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION snapshot_ride_boarding_code() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE active boolean; selected jsonb; digits text := ''; b integer;
BEGIN
 SELECT enabled,categories INTO active,selected FROM ride_boarding_policy WHERE singleton=true FOR SHARE;
 IF active AND COALESCE((selected->>NEW.category)::boolean,false) THEN
  -- Rejection sampling avoids modulo bias. Secrets never enter generic ride responses or audit logs.
  WHILE length(digits)<3 LOOP
   b := get_byte(gen_random_bytes(1),0);
   IF b<250 THEN digits := digits || (b%10)::text; END IF;
  END LOOP;
  INSERT INTO ride_boarding_codes(ride_id,code) VALUES(NEW.id,digits) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rides_boarding_snapshot ON rides;
CREATE TRIGGER rides_boarding_snapshot AFTER INSERT ON rides FOR EACH ROW EXECUTE FUNCTION snapshot_ride_boarding_code();
CREATE TABLE IF NOT EXISTS ride_checkout_recovery (
 ride_id uuid PRIMARY KEY REFERENCES rides(id),
 payment_id uuid NOT NULL REFERENCES payments(id),
 payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rides_passenger_recovery_idx ON rides(passenger_id,updated_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS driver_document_expiry_notices (
 document_id uuid NOT NULL REFERENCES driver_documents(id),
 expires_on date NOT NULL,
 stage text NOT NULL CHECK(stage IN ('soon','expired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(document_id,expires_on,stage)
);
