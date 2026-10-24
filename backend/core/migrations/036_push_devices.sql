-- Migration 036: dispositivos para notificações push.
--
-- Cada token fica vinculado à sessão Bearer que o registrou. Assim, logout em
-- um aparelho desativa somente os tokens daquela sessão, preservando outros
-- aparelhos da mesma conta.

CREATE TABLE IF NOT EXISTS push_devices (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  subject_id text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('passenger', 'driver')),
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  provider text NOT NULL CHECK (provider IN ('apns', 'webhook')),
  token text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS push_devices_subject_enabled_idx
  ON push_devices (subject_type, subject_id, updated_at DESC)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS push_devices_session_idx
  ON push_devices (session_id, updated_at DESC);
