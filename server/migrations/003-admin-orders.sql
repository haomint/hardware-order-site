ALTER TABLE orders ADD COLUMN updated_at INTEGER;
ALTER TABLE orders ADD COLUMN status_updated_at INTEGER;
ALTER TABLE orders ADD COLUMN payment_status_updated_at INTEGER;
ALTER TABLE orders ADD COLUMN admin_note TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN admin_note_updated_at INTEGER;
ALTER TABLE orders ADD COLUMN cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN cancellation_reason_updated_at INTEGER;
ALTER TABLE orders ADD COLUMN final_total_cents INTEGER
  CHECK (final_total_cents BETWEEN 0 AND 9007199254740991);
ALTER TABLE orders ADD COLUMN final_total_updated_at INTEGER;
