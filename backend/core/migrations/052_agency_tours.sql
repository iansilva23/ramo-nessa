-- Migration 052: catálogo administrável de passeios da Ramo Nessa Agência.
--
-- Os registros ficam em modo rascunho por padrão. O app do Passageiro
-- só publica itens com enabled = true. A imagem de capa é opcional e
-- versionada para permitir cache público seguro.

CREATE TABLE IF NOT EXISTS agency_tours (
  slug text PRIMARY KEY
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
    CHECK (sort_order BETWEEN 0 AND 10000),
  title text NOT NULL
    CHECK (char_length(title) BETWEEN 1 AND 120),
  badge text NOT NULL
    CHECK (char_length(badge) BETWEEN 1 AND 32),
  short_description text NOT NULL
    CHECK (char_length(short_description) BETWEEN 1 AND 280),
  description text NOT NULL
    CHECK (char_length(description) BETWEEN 1 AND 4000),
  highlights text[] NOT NULL DEFAULT ARRAY[]::text[],
  included text[] NOT NULL DEFAULT ARRAY[]::text[],
  excluded text[] NOT NULL DEFAULT ARRAY[]::text[],
  duration text,
  schedule text,
  departure text,
  price_label text NOT NULL DEFAULT 'A partir de'
    CHECK (char_length(price_label) BETWEEN 1 AND 40),
  price_cents integer
    CHECK (price_cents IS NULL OR price_cents >= 0),
  price_suffix text,
  whatsapp_phone text NOT NULL DEFAULT '',
  whatsapp_message text NOT NULL DEFAULT '',
  cover_image bytea,
  cover_image_mime_type text,
  cover_image_version integer NOT NULL DEFAULT 0
    CHECK (cover_image_version >= 0),
  updated_at timestamptz NOT NULL,
  CHECK (
    duration IS NULL OR char_length(duration) BETWEEN 1 AND 100
  ),
  CHECK (
    schedule IS NULL OR char_length(schedule) BETWEEN 1 AND 180
  ),
  CHECK (
    departure IS NULL OR char_length(departure) BETWEEN 1 AND 180
  ),
  CHECK (
    price_suffix IS NULL OR char_length(price_suffix) BETWEEN 1 AND 80
  ),
  CHECK (
    whatsapp_phone = '' OR whatsapp_phone ~ '^\\+[1-9][0-9]{9,14}$'
  ),
  CHECK (
    whatsapp_message = '' OR char_length(whatsapp_message) BETWEEN 1 AND 500
  ),
  CHECK (
    (cover_image IS NULL AND cover_image_mime_type IS NULL) OR
    (cover_image IS NOT NULL AND cover_image_mime_type IN (
      'image/jpeg',
      'image/png',
      'image/webp'
    ))
  )
);

CREATE INDEX IF NOT EXISTS agency_tours_public_idx
  ON agency_tours (enabled, sort_order, title);

INSERT INTO agency_tours (
  slug, enabled, sort_order, title, badge,
  short_description, description, price_label,
  whatsapp_phone, whatsapp_message, updated_at
)
VALUES
  (
    'lado-leste', false, 10, 'Passeio Lado Leste', 'COMPARTILHADO',
    'Configure os detalhes deste passeio no painel ADM.',
    'Preencha no painel ADM as informações completas, roteiro, duração, preço e atendimento pelo WhatsApp.',
    'A partir de', '', '', NOW()
  ),
  (
    'lado-oeste', false, 20, 'Passeio Lado Oeste', 'COMPARTILHADO',
    'Configure os detalhes deste passeio no painel ADM.',
    'Preencha no painel ADM as informações completas, roteiro, duração, preço e atendimento pelo WhatsApp.',
    'A partir de', '', '', NOW()
  ),
  (
    'por-do-sol', false, 30, 'Passeio Pôr do Sol', 'EXPERIÊNCIA',
    'Configure os detalhes deste passeio no painel ADM.',
    'Preencha no painel ADM as informações completas, roteiro, duração, preço e atendimento pelo WhatsApp.',
    'A partir de', '', '', NOW()
  ),
  (
    'pedra-furada-bike-eletrica', false, 40, 'Pedra Furada de Bike Elétrica', 'EXPERIÊNCIA',
    'Configure os detalhes deste passeio no painel ADM.',
    'Preencha no painel ADM as informações completas, roteiro, duração, preço e atendimento pelo WhatsApp.',
    'A partir de', '', '', NOW()
  ),
  (
    'utv', false, 50, 'Passeio de UTV', 'PRIVATIVO',
    'Configure os detalhes deste passeio no painel ADM.',
    'Preencha no painel ADM as informações completas, roteiro, duração, preço e atendimento pelo WhatsApp.',
    'A partir de', '', '', NOW()
  ),
  (
    'madrinha', false, 60, 'Passeio Madrinha', 'EXPERIÊNCIA',
    'Configure os detalhes deste passeio no painel ADM.',
    'Preencha no painel ADM as informações completas, roteiro, duração, preço e atendimento pelo WhatsApp.',
    'A partir de', '', '', NOW()
  ),
  (
    'extremo-leste', false, 70, 'Passeio Extremo Leste', 'EXPERIÊNCIA',
    'Configure os detalhes deste passeio no painel ADM.',
    'Preencha no painel ADM as informações completas, roteiro, duração, preço e atendimento pelo WhatsApp.',
    'A partir de', '', '', NOW()
  )
ON CONFLICT (slug) DO NOTHING;
