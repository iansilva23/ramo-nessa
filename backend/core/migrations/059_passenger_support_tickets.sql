-- Migration 059: uma fila de suporte para motoristas e passageiros.
-- A FK original de driver_id permanece ativa. Passageiros referenciam a
-- identidade autenticada por uma FK composta que exige subject_type passenger.

ALTER TABLE driver_support_tickets
  ADD COLUMN IF NOT EXISTS passenger_id text;

ALTER TABLE driver_support_tickets
  ADD COLUMN IF NOT EXISTS passenger_subject_type text
  GENERATED ALWAYS AS ('passenger'::text) STORED;

ALTER TABLE driver_support_tickets
  ALTER COLUMN driver_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'driver_support_tickets_passenger_fkey'
  ) THEN
    ALTER TABLE driver_support_tickets
      ADD CONSTRAINT driver_support_tickets_passenger_fkey
      FOREIGN KEY (passenger_subject_type, passenger_id)
      REFERENCES auth_identities(subject_type, subject_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'driver_support_tickets_requester_check'
  ) THEN
    ALTER TABLE driver_support_tickets
      ADD CONSTRAINT driver_support_tickets_requester_check
      CHECK (num_nonnulls(driver_id, passenger_id) = 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS driver_support_tickets_passenger_created_idx
  ON driver_support_tickets (passenger_id, created_at DESC)
  WHERE passenger_id IS NOT NULL;
