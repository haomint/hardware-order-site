CREATE TABLE order_timeout_reminders (
  order_no TEXT PRIMARY KEY REFERENCES orders (order_no),
  first_dispatch_at INTEGER,
  next_attempt_at INTEGER,
  finished_at INTEGER,
  failure_code TEXT
) STRICT;

CREATE INDEX orders_pending_contact_since
  ON orders (coalesce(status_updated_at, created_at), order_no)
  WHERE status = 'pending_contact';

CREATE INDEX order_timeout_reminders_recovery
  ON order_timeout_reminders (first_dispatch_at)
  WHERE next_attempt_at IS NOT NULL;
