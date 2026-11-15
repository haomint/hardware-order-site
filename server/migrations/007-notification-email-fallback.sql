ALTER TABLE order_notifications ADD COLUMN next_channel TEXT NOT NULL DEFAULT 'wecom'
  CHECK (next_channel IN ('wecom', 'email'));

ALTER TABLE order_notification_attempts ADD COLUMN channel TEXT NOT NULL DEFAULT 'wecom'
  CHECK (channel IN ('wecom', 'email'));
