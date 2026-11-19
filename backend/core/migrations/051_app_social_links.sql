-- Migration 051: links sociais públicos controlados pelo Admin.

CREATE TABLE IF NOT EXISTS app_social_links (
  id text PRIMARY KEY CHECK (id = 'ramo-nessa'),
  instagram_handle text,
  instagram_url text,
  updated_at timestamptz NOT NULL,
  CHECK (
    instagram_handle IS NULL OR
    instagram_handle ~ '^@[A-Za-z0-9._]{1,30}$'
  ),
  CHECK (
    instagram_url IS NULL OR
    instagram_url ~ '^https://'
  )
);

INSERT INTO app_social_links (
  id, instagram_handle, instagram_url, updated_at
)
VALUES ('ramo-nessa', NULL, NULL, NOW())
ON CONFLICT (id) DO NOTHING;
