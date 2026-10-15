CREATE TABLE IF NOT EXISTS app_auth_branding (
  id text PRIMARY KEY,
  hero_image bytea,
  hero_image_mime_type text,
  hero_image_version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_auth_branding_singleton CHECK (id = 'ramo-nessa'),
  CONSTRAINT app_auth_branding_version_non_negative CHECK (hero_image_version >= 0),
  CONSTRAINT app_auth_branding_image_consistent CHECK (
    (hero_image IS NULL AND hero_image_mime_type IS NULL)
    OR
    (hero_image IS NOT NULL AND hero_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp'))
  )
);

INSERT INTO app_auth_branding (id)
VALUES ('ramo-nessa')
ON CONFLICT (id) DO NOTHING;
