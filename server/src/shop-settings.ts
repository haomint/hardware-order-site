import type { DatabaseSync } from "node:sqlite";
import { ShopSchema, type Shop, type ShopPatch } from "../../shared/index.ts";
import { transaction } from "./db.ts";

export function createShopSettings(db: DatabaseSync, defaults: Shop) {
  const fields = "name, phone, wechat_contact_text AS wechatContactText";
  const read = db.prepare(`SELECT ${fields} FROM shop_settings WHERE id = 1`);
  transaction(db, () => {
    if (read.get()) return;
    const { name, phone, wechatContactText } = ShopSchema.parse(defaults);
    db.prepare("INSERT INTO shop_settings (id, name, phone, wechat_contact_text) VALUES (1, ?, ?, ?)")
      .run(name, phone, wechatContactText);
  });

  const update = db.prepare(`
    UPDATE shop_settings
    SET name = coalesce(?, name), phone = coalesce(?, phone), wechat_contact_text = coalesce(?, wechat_contact_text)
    WHERE id = 1
    RETURNING ${fields}
  `);

  return {
    get: () => ShopSchema.parse(read.get()),
    patch: ({ name, phone, wechatContactText }: ShopPatch) =>
      ShopSchema.parse(update.get(name ?? null, phone ?? null, wechatContactText ?? null)),
  };
}
