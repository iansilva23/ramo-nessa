ALTER TABLE auth_identities ADD COLUMN IF NOT EXISTS email_normalized text;
ALTER TABLE auth_otp_challenges ADD COLUMN IF NOT EXISTS requested_email_normalized text;
CREATE INDEX IF NOT EXISTS auth_identities_email_lookup_idx ON auth_identities (subject_type, email_normalized) WHERE email_normalized IS NOT NULL;
