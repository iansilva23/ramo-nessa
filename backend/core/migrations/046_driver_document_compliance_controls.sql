-- Migration 046: controle manual/automático de conformidade documental.
--
-- Por padrão, pendência documental apenas gera alerta no ADM.
-- O bloqueio automático de novas corridas fica explicitamente desligado
-- até o operador ativá-lo.

ALTER TABLE operational_settings
  ADD COLUMN IF NOT EXISTS driver_document_auto_enforcement boolean
    NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS driver_document_compliance_controls (
  driver_id text PRIMARY KEY,
  manual_blocked boolean NOT NULL DEFAULT false,
  notified_at timestamptz,
  acknowledged_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_document_compliance_updated_idx
  ON driver_document_compliance_controls (updated_at DESC);
