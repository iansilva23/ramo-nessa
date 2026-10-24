-- Corrige o nome do passeio: Madrinha -> Barrinha.
-- Mantém dados administrados no ADM quando a instalação já aplicou a migration 052.

UPDATE agency_tours
SET
  slug = 'barrinha',
  title = CASE
    WHEN title = 'Passeio Madrinha' THEN 'Passeio Barrinha'
    ELSE title
  END,
  updated_at = NOW()
WHERE slug = 'madrinha'
  AND NOT EXISTS (
    SELECT 1
    FROM agency_tours existing
    WHERE existing.slug = 'barrinha'
  );

UPDATE agency_tours
SET
  title = 'Passeio Barrinha',
  updated_at = NOW()
WHERE slug = 'barrinha'
  AND title = 'Passeio Madrinha';
