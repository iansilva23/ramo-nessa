-- Migration 004: pedidos de saque do motorista.

CREATE TABLE IF NOT EXISTS driver_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL CHECK (
    status IN ('requested', 'processing', 'paid', 'failed', 'cancelled')
  ),
  idempotency_key text NOT NULL UNIQUE,
  processor text,
  processor_payout_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_payouts_driver_created_idx
  ON driver_payouts (driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS driver_payouts_status_idx
  ON driver_payouts (status);

ALTER TABLE ledger_transactions
  ADD COLUMN IF NOT EXISTS payout_id uuid REFERENCES driver_payouts(id);

CREATE INDEX IF NOT EXISTS ledger_transactions_payout_idx
  ON ledger_transactions (payout_id)
  WHERE payout_id IS NOT NULL;
