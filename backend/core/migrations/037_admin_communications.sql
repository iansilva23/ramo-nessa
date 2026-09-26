-- Migration 037: centro de comunicação, versões dos apps e promoção da agência.
--
-- A comunicação administrativa usa escopos próprios. Usuários/chaves existentes
-- herdam leitura/escrita somente quando já tinham privilégios equivalentes de operação.

ALTER TABLE push_devices
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS build_number integer,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_update_notified_build integer;

ALTER TABLE push_devices
  DROP CONSTRAINT IF EXISTS push_devices_app_version_check;
ALTER TABLE push_devices
  ADD CONSTRAINT push_devices_app_version_check
  CHECK (
    app_version IS NULL OR
    (char_length(app_version) BETWEEN 1 AND 40)
  );

ALTER TABLE push_devices
  DROP CONSTRAINT IF EXISTS push_devices_build_number_check;
ALTER TABLE push_devices
  ADD CONSTRAINT push_devices_build_number_check
  CHECK (build_number IS NULL OR build_number >= 1);

CREATE INDEX IF NOT EXISTS push_devices_version_idx
  ON push_devices (subject_type, platform, build_number)
  WHERE enabled = true AND build_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_notification_campaigns (
  id uuid PRIMARY KEY,
  audience text NOT NULL CHECK (audience IN ('all', 'passenger', 'driver')),
  category text NOT NULL CHECK (
    category IN ('general', 'event', 'service', 'maintenance', 'update', 'promotion')
  ),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 240),
  provider_kind text NOT NULL CHECK (char_length(provider_kind) BETWEEN 1 AND 30),
  device_count integer NOT NULL DEFAULT 0 CHECK (device_count >= 0),
  delivered_count integer NOT NULL DEFAULT 0 CHECK (delivered_count >= 0),
  invalidated_count integer NOT NULL DEFAULT 0 CHECK (invalidated_count >= 0),
  created_by_name text NOT NULL CHECK (char_length(created_by_name) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_notification_campaigns_created_idx
  ON admin_notification_campaigns (created_at DESC);

CREATE TABLE IF NOT EXISTS app_release_policies (
  app_kind text NOT NULL CHECK (app_kind IN ('passenger', 'driver')),
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  latest_version text NOT NULL CHECK (char_length(latest_version) BETWEEN 1 AND 40),
  latest_build integer NOT NULL CHECK (latest_build >= 1),
  minimum_build integer NOT NULL CHECK (
    minimum_build >= 1 AND minimum_build <= latest_build
  ),
  store_url text,
  update_message text NOT NULL CHECK (char_length(update_message) BETWEEN 1 AND 240),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (app_kind, platform)
);

INSERT INTO app_release_policies (
  app_kind, platform, latest_version, latest_build,
  minimum_build, store_url, update_message, updated_at
)
VALUES
  ('passenger', 'android', '0.1.0', 1, 1, NULL,
   'Existe uma nova versão do Ramo Nessa disponível.', NOW()),
  ('passenger', 'ios', '0.1.0', 1, 1, NULL,
   'Existe uma nova versão do Ramo Nessa disponível.', NOW()),
  ('driver', 'android', '0.1.0', 1, 1, NULL,
   'Existe uma nova versão do Ramo Nessa Motorista disponível.', NOW()),
  ('driver', 'ios', '0.1.0', 1, 1, NULL,
   'Existe uma nova versão do Ramo Nessa Motorista disponível.', NOW())
ON CONFLICT (app_kind, platform) DO NOTHING;

CREATE TABLE IF NOT EXISTS agency_promotion (
  id text PRIMARY KEY CHECK (id = 'ramo-nessa-agencia'),
  enabled boolean NOT NULL DEFAULT false,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  subtitle text NOT NULL CHECK (char_length(subtitle) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 600),
  cta_label text NOT NULL CHECK (char_length(cta_label) BETWEEN 1 AND 40),
  cta_url text,
  updated_at timestamptz NOT NULL
);

INSERT INTO agency_promotion (
  id, enabled, title, subtitle, description, cta_label, cta_url, updated_at
)
VALUES (
  'ramo-nessa-agencia',
  false,
  'Ramo Nessa Agência',
  'Passeios e experiências em Jericoacoara',
  'Descubra passeios selecionados em Jericoacoara e região com atendimento da Ramo Nessa.',
  'Conhecer passeios',
  NULL,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

UPDATE admin_users
SET scopes = array_append(scopes, 'communications:read'),
    updated_at = NOW()
WHERE NOT scopes @> ARRAY['communications:read']::text[]
  AND scopes @> ARRAY['rides:read']::text[];

UPDATE admin_users
SET scopes = array_append(scopes, 'communications:write'),
    updated_at = NOW()
WHERE NOT scopes @> ARRAY['communications:write']::text[]
  AND scopes @> ARRAY['rides:write']::text[];

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'communications:read')
WHERE NOT scopes @> ARRAY['communications:read']::text[]
  AND scopes @> ARRAY['rides:read']::text[];

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'communications:write')
WHERE NOT scopes @> ARRAY['communications:write']::text[]
  AND scopes @> ARRAY['rides:write']::text[];
