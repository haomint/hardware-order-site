CREATE TABLE order_notifications (
  order_no TEXT PRIMARY KEY REFERENCES orders (order_no),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'retrying')),
  next_attempt_at INTEGER,
  last_attempt_at INTEGER,
  failure_code TEXT
) STRICT;

CREATE INDEX order_notifications_due ON order_notifications (next_attempt_at, order_no)
  WHERE status = 'retrying';

CREATE TABLE order_notification_attempts (
  order_no TEXT NOT NULL REFERENCES order_notifications (order_no),
  attempt_no INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  failure_code TEXT,
  PRIMARY KEY (order_no, attempt_no)
) STRICT;
