import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { BannerCreateSchema, BannerPatchSchema, maxBanners, type AdminBanner } from "../../shared/index.ts";
import { transaction } from "./db.ts";
import { ApiFailure } from "./errors.ts";
import type { createImages } from "./images.ts";

type BannerRow = {
  id: string;
  background_image_id: string;
  category_id: string;
  title: string;
  description: string;
  button_text: string;
  is_visible: number;
  sort_order: number;
  created_at: number;
};

function bannerData(row: BannerRow) {
  return { id: row.id, categoryId: row.category_id, title: row.title,
    description: row.description, buttonText: row.button_text };
}

export function createBanners(db: DatabaseSync, now: () => number, images: ReturnType<typeof createImages>) {
  const orderBy = "ORDER BY b.sort_order, b.created_at, b.id";
  const publicRows = db.prepare(`
    SELECT b.* FROM storefront_banners b JOIN categories c ON c.id = b.category_id
    WHERE b.is_visible = 1
      AND EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.is_published = 1)
    ${orderBy}
  `);
  const adminRows = db.prepare(`SELECT b.* FROM storefront_banners b ${orderBy}`);
  const count = db.prepare("SELECT count(*) AS total FROM storefront_banners");
  const byId = db.prepare("SELECT * FROM storefront_banners WHERE id = ?");
  const category = db.prepare("SELECT 1 FROM categories WHERE id = ?");
  const insert = db.prepare(`
    INSERT INTO storefront_banners
      (id, background_image_id, category_id, title, description, button_text, is_visible, sort_order, created_at)
    VALUES (:id, :backgroundImageId, :categoryId, :title, :description, :buttonText, :isVisible, :sortOrder, :createdAt)
  `);
  const update = db.prepare(`
    UPDATE storefront_banners SET
      background_image_id = coalesce(:backgroundImageId, background_image_id),
      category_id = coalesce(:categoryId, category_id),
      title = coalesce(:title, title),
      description = coalesce(:description, description),
      button_text = coalesce(:buttonText, button_text),
      is_visible = coalesce(:isVisible, is_visible),
      sort_order = coalesce(:sortOrder, sort_order)
    WHERE id = :id
  `);
  const remove = db.prepare("DELETE FROM storefront_banners WHERE id = ?");

  function get(id: string) {
    const row = byId.get(id) as BannerRow | undefined;
    if (!row) throw new ApiFailure("BANNER_NOT_FOUND");
    return row;
  }

  function requireCategory(id: string) {
    if (!category.get(id)) throw new ApiFailure("CATEGORY_NOT_FOUND");
  }

  function requireBackground(id: string) {
    if (!images.urlIfAvailable(id, "full")) throw new ApiFailure("IMAGE_NOT_FOUND");
  }

  function adminBanner(row: BannerRow): AdminBanner {
    return {
      ...bannerData(row),
      backgroundImageId: row.background_image_id,
      backgroundImageUrl: images.urlIfAvailable(row.background_image_id, "full"),
      isVisible: Boolean(row.is_visible),
      sortOrder: row.sort_order,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  return {
    list() {
      const items = (publicRows.all() as BannerRow[]).flatMap((row) => {
        const backgroundImageUrl = images.urlIfAvailable(row.background_image_id, "full");
        return backgroundImageUrl ? [{ ...bannerData(row), backgroundImageUrl }] : [];
      });
      return { items, total: items.length };
    },
    listAdmin() {
      const items = (adminRows.all() as BannerRow[]).map(adminBanner);
      return { items, total: items.length };
    },
    create(input: ReturnType<typeof BannerCreateSchema.parse>) {
      return transaction(db, () => {
        if (Number(count.get()?.total) >= maxBanners) throw new ApiFailure("BANNER_LIMIT_REACHED");
        const id = randomUUID();
        const timestamp = now();
        const categoryId = input.categoryId.toLowerCase();
        const backgroundImageId = input.backgroundImageId.toLowerCase();
        requireCategory(categoryId);
        requireBackground(backgroundImageId);
        images.claim(backgroundImageId, timestamp);
        insert.run({ ...input, id, categoryId, backgroundImageId, isVisible: Number(input.isVisible), createdAt: timestamp });
        return adminBanner(get(id));
      });
    },
    update(id: string, patch: ReturnType<typeof BannerPatchSchema.parse>) {
      return transaction(db, () => {
        const previous = get(id);
        const timestamp = now();
        const categoryId = patch.categoryId?.toLowerCase() ?? null;
        const backgroundImageId = patch.backgroundImageId?.toLowerCase() ?? null;
        if (categoryId) requireCategory(categoryId);
        if (backgroundImageId || patch.isVisible === true) requireBackground(backgroundImageId ?? previous.background_image_id);
        if (backgroundImageId) images.claim(backgroundImageId, timestamp);
        update.run({
          id, categoryId, backgroundImageId, title: patch.title ?? null, description: patch.description ?? null,
          buttonText: patch.buttonText ?? null, isVisible: patch.isVisible === undefined ? null : Number(patch.isVisible),
          sortOrder: patch.sortOrder ?? null,
        });
        if (backgroundImageId && backgroundImageId !== previous.background_image_id) {
          images.release(previous.background_image_id, timestamp);
        }
        return adminBanner(get(id));
      });
    },
    delete(id: string) {
      transaction(db, () => {
        const previous = get(id);
        remove.run(id);
        images.release(previous.background_image_id, now());
      });
    },
  };
}
