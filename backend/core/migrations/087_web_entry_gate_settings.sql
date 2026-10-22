-- Presentation only. Existing operational, pricing and financial settings stay intact.
ALTER TABLE operational_settings
  ADD COLUMN IF NOT EXISTS web_entry_gate_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS web_entry_gate_revision integer NOT NULL DEFAULT 0 CHECK (web_entry_gate_revision >= 0),
  ADD COLUMN IF NOT EXISTS web_entry_gate_updated_at timestamptz NOT NULL DEFAULT now();
