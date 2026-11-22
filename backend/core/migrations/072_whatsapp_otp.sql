ALTER TABLE auth_otp_challenges
  ADD COLUMN external_provider text,
  ADD COLUMN external_reference text,
  ADD COLUMN verification_nonce uuid,
  ADD COLUMN verification_lease_until timestamptz,
  ADD CONSTRAINT auth_otp_external_provider CHECK (
    external_provider IS NULL OR external_provider = 'entrar-whatsapp'
  );
