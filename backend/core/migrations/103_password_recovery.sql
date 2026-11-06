CREATE TABLE auth_recovery_contacts (
  identity_id uuid NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  destination_hash text NOT NULL,
  PRIMARY KEY (identity_id, channel)
);

CREATE TABLE auth_recovery_challenges (
  id uuid PRIMARY KEY,
  identity_id uuid NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  session_id uuid REFERENCES auth_sessions(id) ON DELETE CASCADE,
  destination_hash text NOT NULL,
  credential_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  proof text,
  attempts smallint NOT NULL DEFAULT 0,
  checking boolean NOT NULL DEFAULT false,
  consumed_at timestamptz
);

CREATE INDEX auth_recovery_challenges_expiry_idx ON auth_recovery_challenges (expires_at);

CREATE FUNCTION clear_changed_recovery_contacts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email_normalized IS DISTINCT FROM OLD.email_normalized THEN
    DELETE FROM auth_recovery_contacts WHERE identity_id = NEW.id AND channel = 'email';
    DELETE FROM auth_recovery_challenges WHERE identity_id = NEW.id AND channel = 'email';
  END IF;
  IF NEW.phone_e164 IS DISTINCT FROM OLD.phone_e164 THEN
    DELETE FROM auth_recovery_contacts WHERE identity_id = NEW.id AND channel = 'whatsapp';
    DELETE FROM auth_recovery_challenges WHERE identity_id = NEW.id AND channel = 'whatsapp';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auth_recovery_contacts_changed
  AFTER UPDATE OF email_normalized, phone_e164 ON auth_identities
  FOR EACH ROW EXECUTE FUNCTION clear_changed_recovery_contacts();

CREATE TABLE auth_recovery_rate_limits (
  bucket_key text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL
);

CREATE INDEX auth_recovery_rate_limits_expiry_idx ON auth_recovery_rate_limits (expires_at);
