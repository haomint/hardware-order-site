ALTER TABLE categories ADD COLUMN icon_image_id TEXT REFERENCES images (id);
CREATE INDEX categories_icon_image ON categories (icon_image_id);

CREATE TABLE storefront_banners (
  id TEXT PRIMARY KEY,
  background_image_id TEXT NOT NULL REFERENCES images (id),
  category_id TEXT NOT NULL REFERENCES categories (id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  button_text TEXT NOT NULL,
  is_visible INTEGER NOT NULL CHECK (is_visible IN (0, 1)),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 9999),
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX storefront_banners_category ON storefront_banners (category_id);
CREATE INDEX storefront_banners_image ON storefront_banners (background_image_id);
