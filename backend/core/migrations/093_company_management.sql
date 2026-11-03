-- Management records never move provider funds or change the financial ledger.
CREATE TABLE company_management_records (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('withdrawal','return','contribution','bank','close','reopen','reversal')),
 amount_cents bigint NOT NULL CHECK(amount_cents>=0 AND amount_cents<=100000000000),
 occurred_on date NOT NULL, description text NOT NULL, reference_id uuid REFERENCES company_management_records(id),
 attachment jsonb, actor jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(kind NOT IN ('return','reversal') OR reference_id IS NOT NULL)
);
CREATE UNIQUE INDEX company_management_reversal_once ON company_management_records(reference_id) WHERE kind='reversal';
CREATE INDEX company_management_date ON company_management_records(occurred_on,created_at);
