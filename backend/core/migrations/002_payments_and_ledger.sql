-- Migration 002: pagamentos e ledger financeiro.
--
-- Princípio: dinheiro recebido primeiro entra em escrow da corrida.
-- A comissão de 10% e o valor do motorista só são reconhecidos/liberados
-- na liquidação da corrida, não no simples recebimento do pagamento.

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id),
  method text NOT NULL CHECK (method IN ('pix', 'card', 'wallet')),
  processor text NOT NULL,
  processor_payment_id text,
  status text NOT NULL CHECK (
    status IN ('created', 'pending', 'authorized', 'paid', 'failed', 'cancelled', 'refunded')
  ),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_ride_idx
  ON payments (ride_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payments_status_idx
  ON payments (status);

CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor text NOT NULL,
  processor_event_id text NOT NULL,
  payment_id uuid NOT NULL REFERENCES payments(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processor, processor_event_id)
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  ride_id uuid REFERENCES rides(id),
  payment_id uuid REFERENCES payments(id),
  reference_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES ledger_transactions(id),
  account_key text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_entries_account_idx
  ON ledger_entries (account_key, created_at DESC);

CREATE INDEX IF NOT EXISTS ledger_entries_transaction_idx
  ON ledger_entries (transaction_id);
