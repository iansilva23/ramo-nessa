-- Private driver-only identity binding, never returned by public profile APIs.
CREATE TABLE driver_cpf_bindings (
  driver_id text PRIMARY KEY REFERENCES driver_profiles(driver_id) ON DELETE CASCADE,
  cpf_normalized text NOT NULL CONSTRAINT driver_cpf_unique UNIQUE,
  CONSTRAINT driver_cpf_digits CHECK (cpf_normalized ~ '^[0-9]{11}$')
);
