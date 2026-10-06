-- Relatório gerencial independente. Não escreve no ledger, pagamentos ou repasses.
CREATE TABLE IF NOT EXISTS company_cost_items (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('expense', 'rule')),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_cost_items_kind_idx ON company_cost_items(kind);

-- Valor declarado pelo proprietário, estimado até conferir a cobrança real.
INSERT INTO company_cost_items(id, kind, data)
VALUES ('c0510000-0000-4000-8000-000000000099', 'rule', jsonb_build_object(
  'name', 'Taxa Pix assumida pela empresa', 'category', 'Pagamentos',
  'slot', 'processing_fee', 'basis', 'pix_payment', 'amountCents', 99,
  'rateBps', 0, 'certainty', 'estimated',
  'startsOn', (now() AT TIME ZONE 'America/Fortaleza')::date::text,
  'endsOn', null, 'notes', 'R$ 0,99 informado pelo proprietário. Confira a cobrança no provedor.'
)) ON CONFLICT (id) DO NOTHING;

UPDATE admin_users SET scopes = array_append(scopes, 'costs:read')
WHERE ('finance:read' = ANY(scopes) OR 'finance:write' = ANY(scopes)) AND NOT ('costs:read' = ANY(scopes));
UPDATE admin_users SET scopes = array_append(scopes, 'costs:write')
WHERE 'finance:write' = ANY(scopes) AND NOT ('costs:write' = ANY(scopes));
UPDATE admin_api_keys SET scopes = array_append(scopes, 'costs:read')
WHERE ('finance:read' = ANY(scopes) OR 'finance:write' = ANY(scopes)) AND NOT ('costs:read' = ANY(scopes));
UPDATE admin_api_keys SET scopes = array_append(scopes, 'costs:write')
WHERE 'finance:write' = ANY(scopes) AND NOT ('costs:write' = ANY(scopes));
