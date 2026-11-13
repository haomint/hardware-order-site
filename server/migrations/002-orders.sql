CREATE TABLE orders (
  order_no TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_digest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('delivery', 'pickup')),
  address TEXT,
  note TEXT NOT NULL,
  items_json TEXT NOT NULL CHECK (json_valid(items_json)),
  estimated_total_cents INTEGER NOT NULL CHECK (estimated_total_cents BETWEEN 0 AND 9007199254740991),
  status TEXT NOT NULL DEFAULT 'pending_contact'
    CHECK (status IN ('pending_contact', 'pending_payment', 'pending_fulfillment', 'completed', 'cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  CHECK ((delivery_method = 'pickup' AND address IS NULL)
    OR (delivery_method = 'delivery' AND address IS NOT NULL AND length(address) > 0))
) STRICT;

CREATE INDEX orders_created_at ON orders (created_at DESC, order_no DESC);
