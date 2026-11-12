-- Requests waiting for settlement remain separate from closed accounts.
-- In particular, migration105 must not block the payment/withdrawal needed to settle them.
CREATE TABLE self_account_deletion_requests (
 id uuid PRIMARY KEY,
 subject_type text NOT NULL CHECK(subject_type IN ('driver','passenger')),
 subject_id text NOT NULL,
 receipt_hash text NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('waiting','processing','deleted')),
 reason text,
 requested_at timestamptz NOT NULL DEFAULT now(),
 checked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subject_type,subject_id)
);
CREATE INDEX self_deletion_waiting_idx ON self_account_deletion_requests(updated_at,id) WHERE status='waiting';
