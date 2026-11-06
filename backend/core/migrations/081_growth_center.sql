-- Additive: no payment/ledger changes, no campaigns or sends enabled.
CREATE TABLE marketing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), data jsonb NOT NULL
);
INSERT INTO marketing_settings VALUES(true, '{"enabled":false,"maxContactsPerWeek":2,"quietStartHour":21,"quietEndHour":8,"updatedAt":"1970-01-01T00:00:00.000Z"}');
CREATE TABLE marketing_preferences (
  passenger_id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE marketing_campaigns (
  id uuid PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE marketing_deliveries (
  id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id), passenger_id text NOT NULL,
  occurrence text NOT NULL, created_at timestamptz NOT NULL, state text NOT NULL,
  held_cents integer NOT NULL CHECK(held_cents >= 0), data jsonb NOT NULL,
  UNIQUE(campaign_id, passenger_id, occurrence)
);
CREATE INDEX marketing_contact_cap_idx ON marketing_deliveries(passenger_id,created_at DESC);
CREATE INDEX marketing_pending_idx ON marketing_deliveries(state,created_at);
CREATE TABLE operational_issue_reviews (key text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE marketing_referrals (
  passenger_id text PRIMARY KEY, referrer_id text NOT NULL, code text NOT NULL, created_at timestamptz NOT NULL,
  CHECK(passenger_id <> referrer_id)
);
CREATE INDEX marketing_referrer_idx ON marketing_referrals(referrer_id);
ALTER TABLE promotion_campaigns ADD COLUMN target_passenger_id text;
ALTER TABLE promotion_campaigns ADD COLUMN allowed_zones text[] NOT NULL DEFAULT ARRAY[]::text[];
-- Consultations inherit their existing data-reading scope. Sending requires a
-- separately assigned permission; no existing account gains send permission.
UPDATE admin_users SET scopes=array_append(scopes,'issues:read') WHERE 'support:read'=ANY(scopes) AND NOT ('issues:read'=ANY(scopes));
UPDATE admin_users SET scopes=array_append(scopes,'issues:write') WHERE 'support:write'=ANY(scopes) AND NOT ('issues:write'=ANY(scopes));
UPDATE admin_users SET scopes=array_append(scopes,'marketing:read') WHERE 'communications:read'=ANY(scopes) AND NOT ('marketing:read'=ANY(scopes));
UPDATE admin_users SET scopes=array_append(scopes,'marketing:write') WHERE 'communications:write'=ANY(scopes) AND NOT ('marketing:write'=ANY(scopes));
