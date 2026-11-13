import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  AdminProductQuerySchema,
  CategoryCreateSchema,
  CategoryPatchSchema,
  ProductWriteSchema,
  type AdminProduct,
  type ProductDetail,
  type ProductListItem,
  type UpdateProduct,
} from "../../shared/index.ts";
import { transaction } from "./db.ts";
import { ApiFailure, validate } from "./errors.ts";
import { adminImage, imagePaths } from "./images.ts";

type CategoryRow = { id: string; name: string; sort_order: number; created_at: number };
type ProductWrite = ReturnType<typeof ProductWriteSchema.parse>;
type ProductRow = {
  id: string;
  name: string;
  brand: string;
  model: string;
  category_id: string;
  price_cents: number | null;
  unit: string;
  specifications: string;
  is_published: number;
  is_out_of_stock: number;
  is_pinned: number;
  sort_order: number;
  main_image_id: string | null;
  created_at: number;
};

const date = (timestamp: number) => new Date(timestamp).toISOString();
const categoryData = (row: CategoryRow) => ({
  id: row.id, name: row.name, sortOrder: row.sort_order, createdAt: date(row.created_at),
});
const productFields = (row: ProductRow) => ({
  id: row.id, name: row.name, brand: row.brand, model: row.model, categoryId: row.category_id,
  priceCents: row.price_cents, unit: row.unit, isOutOfStock: Boolean(row.is_out_of_stock), createdAt: date(row.created_at),
});

function publicItem(row: ProductRow): ProductListItem {
  if (row.main_image_id === null) throw new Error("上架商品缺少主图。");
  return { ...productFields(row), mainImage: imagePaths(row.main_image_id) };
}

function imageIds(main: string | null, details: string[]) {
  return main === null ? details : [main, ...details];
}

function productBindings(product: ProductWrite) {
  return {
    name: product.name, brand: product.brand, model: product.model, categoryId: product.categoryId,
    priceCents: product.priceCents, unit: product.unit, specifications: product.specifications,
    isPublished: Number(product.isPublished), isOutOfStock: Number(product.isOutOfStock),
    isPinned: Number(product.isPinned), sortOrder: product.sortOrder, mainImageId: product.mainImageId,
  };
}

export function createCatalog(db: DatabaseSync, now: () => number) {
  const categories = db.prepare(`
    SELECT * FROM categories c
    WHERE :admin = 1 OR EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.is_published = 1)
    ORDER BY sort_order, created_at, id
  `);
  const categoryById = db.prepare("SELECT * FROM categories WHERE id = ?");
  const categoryByName = db.prepare("SELECT id FROM categories WHERE name = ?");
  const insertCategory = db.prepare("INSERT INTO categories VALUES (?, ?, ?, ?)");
  const updateCategory = db.prepare("UPDATE categories SET name = ?, sort_order = ? WHERE id = ?");
  const deleteCategory = db.prepare("DELETE FROM categories WHERE id = ?");
  const categoryInUse = db.prepare("SELECT 1 FROM products WHERE category_id = ? LIMIT 1");

  const productById = db.prepare("SELECT * FROM products WHERE id = ?");
  const productImages = db.prepare("SELECT image_id FROM product_detail_images WHERE product_id = ? ORDER BY position");
  const insertProduct = db.prepare(`
    INSERT INTO products (id, name, brand, model, category_id, price_cents, unit, specifications,
      is_published, is_out_of_stock, is_pinned, sort_order, main_image_id, created_at)
    VALUES (:id, :name, :brand, :model, :categoryId, :priceCents, :unit, :specifications,
      :isPublished, :isOutOfStock, :isPinned, :sortOrder, :mainImageId, :createdAt)
  `);
  const updateProduct = db.prepare(`
    UPDATE products SET name = :name, brand = :brand, model = :model, category_id = :categoryId,
      price_cents = :priceCents, unit = :unit, specifications = :specifications, is_published = :isPublished,
      is_out_of_stock = :isOutOfStock, is_pinned = :isPinned, sort_order = :sortOrder, main_image_id = :mainImageId
    WHERE id = :id
  `);
  const deleteProduct = db.prepare("DELETE FROM products WHERE id = ?");
  const addDetail = db.prepare("INSERT INTO product_detail_images VALUES (?, ?, ?)");
  const removeDetails = db.prepare("DELETE FROM product_detail_images WHERE product_id = ?");
  const claimImage = db.prepare("UPDATE images SET expires_at = NULL WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)");
  const releaseImage = db.prepare(`
    UPDATE images SET expires_at = :now WHERE id = :id
      AND NOT EXISTS (SELECT 1 FROM products WHERE main_image_id = :id)
      AND NOT EXISTS (SELECT 1 FROM product_detail_images WHERE image_id = :id)
  `);
  const filter = `
    WHERE (:admin = 1 OR is_published = 1)
      AND (:categoryId IS NULL OR category_id = :categoryId)
      AND (:isPublished IS NULL OR is_published = :isPublished)
      AND (:isOutOfStock IS NULL OR is_out_of_stock = :isOutOfStock)
      AND (:q = '' OR instr(lower(name), :q) > 0 OR instr(lower(brand), :q) > 0 OR instr(lower(model), :q) > 0)
  `;
  const countProducts = db.prepare(`SELECT COUNT(*) AS total FROM products ${filter}`);
  const findProducts = db.prepare(`
    SELECT * FROM products ${filter}
    ORDER BY is_pinned DESC, sort_order, created_at DESC, id LIMIT :limit OFFSET :offset
  `);

  function getCategory(id: string) {
    const row = categoryById.get(id) as CategoryRow | undefined;
    if (!row) throw new ApiFailure("CATEGORY_NOT_FOUND");
    return row;
  }

  function requireAvailableCategoryName(name: string, id?: string) {
    const existing = categoryByName.get(name);
    if (existing && existing.id !== id) throw new ApiFailure("CATEGORY_NAME_EXISTS");
  }

  function getRow(id: string, admin: boolean) {
    const row = productById.get(id) as ProductRow | undefined;
    if (!row || (!admin && !row.is_published)) throw new ApiFailure("PRODUCT_NOT_FOUND");
    return row;
  }

  function findPublicItem(id: string) {
    const row = productById.get(id.toLowerCase()) as ProductRow | undefined;
    return row?.is_published ? publicItem(row) : undefined;
  }

  function details(id: string) {
    return (productImages.all(id) as { image_id: string }[]).map(({ image_id }) => image_id);
  }

  function adminProduct(row: ProductRow): AdminProduct {
    return {
      ...productFields(row),
      specifications: row.specifications,
      mainImage: row.main_image_id === null ? null : adminImage(row.main_image_id),
      detailImages: details(row.id).map(adminImage),
      isPublished: Boolean(row.is_published),
      isPinned: Boolean(row.is_pinned),
      sortOrder: row.sort_order,
    };
  }

  function normalizeProduct(product: ProductWrite) {
    return validate(ProductWriteSchema, {
      ...product,
      categoryId: product.categoryId.toLowerCase(),
      mainImageId: product.mainImageId?.toLowerCase() ?? null,
      detailImageIds: product.detailImageIds.map((id) => id.toLowerCase()),
    });
  }

  function claimImages(product: ProductWrite, timestamp: number) {
    for (const id of imageIds(product.mainImageId, product.detailImageIds)) {
      if (!claimImage.run(id, timestamp).changes) throw new ApiFailure("IMAGE_NOT_FOUND");
    }
  }

  function writeDetails(productId: string, ids: string[]) {
    ids.forEach((imageId, position) => addDetail.run(productId, position, imageId));
  }

  function releaseImages(ids: string[], timestamp: number) {
    for (const id of ids) releaseImage.run({ id, now: timestamp });
  }

  function productPage(admin: boolean, query: ReturnType<typeof AdminProductQuerySchema.parse>) {
    const bindings = {
      admin: Number(admin),
      categoryId: query.categoryId?.toLowerCase() ?? null,
      q: (query.q ?? "").replace(/[A-Z]/g, (letter) => letter.toLowerCase()),
      isPublished: query.isPublished === undefined ? null : Number(query.isPublished === "true"),
      isOutOfStock: query.isOutOfStock === undefined ? null : Number(query.isOutOfStock === "true"),
    };
    const limit = Number(query.pageSize);
    const offset = (Number(query.page) - 1) * limit;
    const total = Number(countProducts.get(bindings)?.total);
    return { total, rows: findProducts.all({ ...bindings, limit, offset }) as ProductRow[] };
  }

  return {
    listCategories(admin: boolean) {
      const items = (categories.all({ admin: Number(admin) }) as CategoryRow[]).map(categoryData);
      return { items, total: items.length };
    },
    createCategory(input: ReturnType<typeof CategoryCreateSchema.parse>) {
      return transaction(db, () => {
        requireAvailableCategoryName(input.name);
        const id = randomUUID();
        const timestamp = now();
        insertCategory.run(id, input.name, input.sortOrder, timestamp);
        return { id, ...input, createdAt: date(timestamp) };
      });
    },
    updateCategory(id: string, input: ReturnType<typeof CategoryPatchSchema.parse>) {
      return transaction(db, () => {
        const current = categoryData(getCategory(id));
        const next = { ...current, ...input };
        requireAvailableCategoryName(next.name, id);
        updateCategory.run(next.name, next.sortOrder, id);
        return next;
      });
    },
    deleteCategory(id: string) {
      transaction(db, () => {
        getCategory(id);
        if (categoryInUse.get(id)) throw new ApiFailure("CATEGORY_IN_USE");
        deleteCategory.run(id);
      });
    },
    listProducts(query: ReturnType<typeof AdminProductQuerySchema.parse>) {
      const { total, rows } = productPage(false, query);
      return { total, items: rows.map(publicItem) };
    },
    listAdminProducts(query: ReturnType<typeof AdminProductQuerySchema.parse>) {
      const { total, rows } = productPage(true, query);
      return { total, items: rows.map(adminProduct) };
    },
    getProduct(id: string): ProductDetail {
      const row = getRow(id, false);
      return { ...publicItem(row), specifications: row.specifications, detailImages: details(id).map(imagePaths) };
    },
    findPublicItem,
    getAdminProduct(id: string) {
      return adminProduct(getRow(id, true));
    },
    createProduct(input: ProductWrite) {
      return transaction(db, () => {
        const product = normalizeProduct(input);
        const timestamp = now();
        getCategory(product.categoryId);
        claimImages(product, timestamp);
        const id = randomUUID();
        insertProduct.run({ ...productBindings(product), id, createdAt: timestamp });
        writeDetails(id, product.detailImageIds);
        return adminProduct(getRow(id, true));
      });
    },
    updateProduct(id: string, patch: UpdateProduct) {
      return transaction(db, () => {
        const row = getRow(id, true);
        const previousDetails = details(id);
        const product = normalizeProduct({
          name: row.name, brand: row.brand, model: row.model, categoryId: row.category_id,
          priceCents: row.price_cents, unit: row.unit, specifications: row.specifications,
          isPublished: Boolean(row.is_published), isOutOfStock: Boolean(row.is_out_of_stock),
          isPinned: Boolean(row.is_pinned), sortOrder: row.sort_order,
          mainImageId: row.main_image_id, detailImageIds: previousDetails,
          ...patch,
        });
        const timestamp = now();
        getCategory(product.categoryId);
        claimImages(product, timestamp);
        updateProduct.run({ ...productBindings(product), id });
        removeDetails.run(id);
        writeDetails(id, product.detailImageIds);
        releaseImages(imageIds(row.main_image_id, previousDetails), timestamp);
        return adminProduct(getRow(id, true));
      });
    },
    deleteProduct(id: string) {
      transaction(db, () => {
        const row = getRow(id, true);
        const ids = imageIds(row.main_image_id, details(id));
        deleteProduct.run(id);
        releaseImages(ids, now());
      });
    },
  };
}
