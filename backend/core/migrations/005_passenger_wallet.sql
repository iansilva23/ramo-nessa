-- Migration 005: Carteira Ramo Nessa do passageiro.

CREATE TABLE IF NOT EXISTS wallet_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id text NOT NULL,
  method text NOT NULL CHECK (method IN ('pix', 'card')),
  processor text NOT NULL,
  processor_topup_id text,
  status text NOT NULL CHECK (
    status IN ('created', 'pending', 'authorized', 'paid', 'failed', 'cancelled', 'refunded')
  ),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_topups_passenger_created_idx
  ON wallet_topups (passenger_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wallet_topups_status_idx
  ON wallet_topups (status);

CREATE TABLE IF NOT EXISTS wallet_topup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor text NOT NULL,
  processor_event_id text NOT NULL,
  wallet_topup_id uuid NOT NULL REFERENCES wallet_topups(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processor, processor_event_id)
);

ALTER TABLE ledger_transactions
  ADD COLUMN IF NOT EXISTS wallet_topup_id uuid REFERENCES wallet_topups(id);

CREATE INDEX IF NOT EXISTS ledger_transactions_wallet_topup_idx
  ON ledger_transactions (wallet_topup_id)
  WHERE wallet_topup_id IS NOT NULL;
