CREATE TABLE shop_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  wechat_contact_text TEXT NOT NULL
) STRICT;
