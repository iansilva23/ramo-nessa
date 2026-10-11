-- Migration 050: chat entre passageiro e motorista vinculado à corrida.

CREATE TABLE IF NOT EXISTS ride_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (
    sender_type IN ('passenger', 'driver')
  ),
  sender_id text NOT NULL,
  body text NOT NULL CHECK (
    char_length(body) BETWEEN 1 AND 1000
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ride_chat_messages_ride_created_idx
  ON ride_chat_messages (ride_id, created_at, id);
