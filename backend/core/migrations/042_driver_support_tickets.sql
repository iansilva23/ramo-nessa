-- Migration 042: chamados de suporte do motorista.

CREATE TABLE IF NOT EXISTS driver_support_tickets (
  id uuid PRIMARY KEY,
  driver_id text NOT NULL
    REFERENCES driver_profiles(driver_id) ON DELETE CASCADE,
  category text NOT NULL
    CHECK (category IN ('ride', 'payment', 'account', 'document', 'other')),
  subject text NOT NULL
    CHECK (char_length(subject) BETWEEN 3 AND 120),
  message text NOT NULL
    CHECK (char_length(message) BETWEEN 10 AND 2000),
  status text NOT NULL
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  response text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (
    (response IS NULL AND responded_at IS NULL)
    OR
    (response IS NOT NULL AND responded_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS driver_support_tickets_driver_created_idx
  ON driver_support_tickets (driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS driver_support_tickets_status_created_idx
  ON driver_support_tickets (status, created_at DESC);
