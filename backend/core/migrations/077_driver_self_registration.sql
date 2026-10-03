-- Driver phone verification grants onboarding access only; admin approval grants operational access.
ALTER TABLE auth_identities ADD COLUMN IF NOT EXISTS driver_registration_only boolean NOT NULL DEFAULT false;
ALTER TABLE auth_identities ADD CONSTRAINT driver_registration_subject CHECK (NOT driver_registration_only OR subject_type = 'driver');
