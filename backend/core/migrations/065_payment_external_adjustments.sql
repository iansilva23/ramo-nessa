-- Migration 065: ajustes financeiros externos de pagamentos.
--
-- Reembolsos parciais e contestações não podem ser apenas "logados":
-- cada evento do processador precisa ser idempotente, auditável e reconciliável.

CREATE TABLE IF NOT EXISTS payment_external_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  processor text NOT NULL,
  processor_adjustment_id text NOT NULL,
  kind text NOT NULL CHECK (
    kind IN ('partial_refund', 'chargeback')
  ),
  processor_status text NOT NULL,
  processor_status_detail text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  escrow_applied_cents integer NOT NULL DEFAULT 0 CHECK (
    escrow_applied_cents >= 0
  ),
  review_required_cents integer NOT NULL DEFAULT 0 CHECK (
    review_required_cents >= 0
  ),
  accounting_status text NOT NULL CHECK (
    accounting_status IN (
      'observed',
      'applied_to_escrow',
      'review_required'
    )
  ),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (processor, processor_adjustment_id),
  CHECK (
    escrow_applied_cents + review_required_cents <= amount_cents
  )
);

CREATE INDEX IF NOT EXISTS payment_external_adjustments_payment_idx
  ON payment_external_adjustments (payment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_external_adjustments_review_idx
  ON payment_external_adjustments (accounting_status, updated_at DESC)
  WHERE accounting_status = 'review_required';
