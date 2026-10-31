-- Gateway identifiers and masked metadata only. Never PAN, CVV or temporary tokens.
CREATE TABLE IF NOT EXISTS passenger_payment_customers (
  passenger_id text NOT NULL,
  gateway_scope text NOT NULL,
  customer_id text NOT NULL,
  PRIMARY KEY (passenger_id, gateway_scope),
  UNIQUE (gateway_scope, customer_id)
);
CREATE TABLE IF NOT EXISTS passenger_saved_cards (
  passenger_id text NOT NULL,
  gateway_scope text NOT NULL,
  card_id text NOT NULL,
  last_four_digits text NOT NULL CHECK (last_four_digits ~ '^[0-9]{4}$'),
  payment_method_id text NOT NULL,
  payment_method_type text NOT NULL CHECK (payment_method_type IN ('credit_card', 'debit_card')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (passenger_id, gateway_scope, card_id),
  FOREIGN KEY (passenger_id, gateway_scope) REFERENCES passenger_payment_customers ON DELETE CASCADE
);
