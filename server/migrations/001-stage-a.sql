CREATE TABLE administrator (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL
) STRICT;

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX admin_sessions_expiry ON admin_sessions (expires_at);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 9999),
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE images (
  id TEXT PRIMARY KEY,
  expires_at INTEGER
) STRICT;

CREATE INDEX images_expiry ON images (expires_at);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories (id),
  price_cents INTEGER CHECK (price_cents BETWEEN 0 AND 9007199254740991),
  unit TEXT NOT NULL,
  specifications TEXT NOT NULL,
  is_published INTEGER NOT NULL CHECK (is_published IN (0, 1)),
  is_out_of_stock INTEGER NOT NULL CHECK (is_out_of_stock IN (0, 1)),
  is_pinned INTEGER NOT NULL CHECK (is_pinned IN (0, 1)),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 9999),
  main_image_id TEXT REFERENCES images (id),
  created_at INTEGER NOT NULL,
  CHECK (is_published = 0 OR main_image_id IS NOT NULL)
) STRICT;

CREATE INDEX products_category ON products (category_id, is_published);
CREATE INDEX products_main_image ON products (main_image_id);

CREATE TABLE product_detail_images (
  product_id TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
  image_id TEXT NOT NULL REFERENCES images (id),
  PRIMARY KEY (product_id, position),
  UNIQUE (product_id, image_id)
) STRICT;

CREATE INDEX product_detail_images_image ON product_detail_images (image_id);
