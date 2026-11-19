-- Reading is recorded per recipient and message. Existing messages start unread.
CREATE TABLE IF NOT EXISTS ride_chat_reads (
  message_id uuid NOT NULL REFERENCES ride_chat_messages(id) ON DELETE CASCADE,
  reader_type text NOT NULL CHECK (reader_type IN ('passenger', 'driver')),
  reader_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, reader_type, reader_id)
);
