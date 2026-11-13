ALTER TABLE order_notifications ADD COLUMN manual_deadline_at INTEGER;

CREATE INDEX order_notifications_manual_deadline ON order_notifications (manual_deadline_at)
  WHERE manual_deadline_at IS NOT NULL;

CREATE TABLE order_notification_retry_keys (
  order_no TEXT NOT NULL REFERENCES order_notifications (order_no),
  idempotency_key TEXT NOT NULL,
  PRIMARY KEY (order_no, idempotency_key)
) STRICT;
