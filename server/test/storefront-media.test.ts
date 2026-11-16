import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import sharp from "sharp";
import {
  AdminBannerListSchema, AdminBannerSchema, AdminImageSchema, AdminProductSchema, ApiErrorSchema,
  BannerListSchema, CategoryListSchema, CategorySchema, maxBanners,
} from "../../shared/index.ts";
import { setAdministrator } from "../src/auth.ts";
import { loadConfig } from "../src/config.ts";
import { openDatabase } from "../src/db.ts";
import { createApp } from "../src/http.ts";

const origin = "http://localhost:5173";
const banners = "/api/admin/banners";
const categories = "/api/admin/categories";

async function fixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "hardware-media-"));
  const uploadDir = join(dir, "uploads");
  const db = openDatabase(join(dir, "test.sqlite"));
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let time = Date.parse("2026-11-16T00:00:00Z");
  const { app, cleanup } = createApp(db, loadConfig({ UPLOAD_DIR: uploadDir }), () => time);
  const credentials = { username: "test-owner", password: "fixture-password" };
  await setAdministrator(db, credentials);
  const login = await app.request("/api/admin/login", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(credentials),
  });
  const cookie = login.headers.get("Set-Cookie")?.split(";")[0];
  assert.ok(cookie);
  const request = (path: string, method = "GET", body?: object, source = origin) => app.request(path, {
    method, headers: { Origin: source, Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return {
    app, db, request, cleanup,
    advance(ms: number) { time += ms; },
    removeFile(url: string) { rmSync(join(uploadDir, url.split("/").at(-1)!), { force: true }); },
    async upload(width = 20, height = 20) {
      const jpeg = await sharp({ create: { width, height, channels: 3, background: "red" } }).jpeg().toBuffer();
      const data = new FormData();
      data.set("file", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "test.jpg");
      const response = await app.request("/api/admin/images", {
        method: "POST", headers: { Origin: origin, Cookie: cookie }, body: data,
      });
      assert.equal(response.status, 201);
      return AdminImageSchema.parse(await response.json());
    },
  };
}

async function failure(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  const body = ApiErrorSchema.parse(await response.json());
  assert.equal(body.code, code);
  return body;
}

test("分类图标支持设置、保留、清除及缺失回退，图片共享时仅清理最后一处引用", async (t) => {
  const f = await fixture(t);
  const square = await f.upload();
  const wide = await f.upload(40, 20);
  const notSquare = await failure(await f.request(categories, "POST", { name: "管件", iconImageId: wide.id }),
    400, "INVALID_REQUEST");
  assert.ok(notSquare.code === "INVALID_REQUEST" && notSquare.fieldErrors?.iconImageId);
  await failure(await f.request(categories, "POST", { name: "管件", iconImageId: randomUUID() }), 404, "IMAGE_NOT_FOUND");

  const addCategory = await f.request(categories, "POST", { name: "管件", iconImageId: square.id.toUpperCase() });
  assert.equal(addCategory.status, 201);
  const category = CategorySchema.parse(await addCategory.json());
  assert.equal(category.iconUrl, square.thumbnailUrl);
  const categoryPath = `${categories}/${category.id}`;
  const renamed = CategorySchema.parse(await (await f.request(categoryPath, "PATCH", { name: "水暖管件" })).json());
  assert.equal(renamed.iconUrl, square.thumbnailUrl);
  assert.equal((await f.app.request(square.thumbnailUrl, { method: "HEAD" })).status, 200);

  const addProduct = await f.request("/api/admin/products", "POST", {
    name: "弯管", categoryId: category.id, priceCents: 250, unit: "件", specifications: "PVC",
    mainImageId: square.id, isPublished: true,
  });
  assert.equal(addProduct.status, 201);
  const product = AdminProductSchema.parse(await addProduct.json());
  const publicCategories = async () => CategoryListSchema.parse(await (await f.request("/api/categories")).json()).items;
  assert.equal((await publicCategories())[0].iconUrl, square.thumbnailUrl);
  const addBanner = await f.request(banners, "POST", { categoryId: category.id, backgroundImageId: square.id });
  const banner = AdminBannerSchema.parse(await addBanner.json());
  await failure(await f.request(categoryPath, "DELETE"), 409, "CATEGORY_IN_USE");

  assert.equal((await f.request(`/api/admin/products/${product.id}`, "DELETE")).status, 204);
  assert.equal((await f.app.request(square.imageUrl, { method: "HEAD" })).status, 200);
  await failure(await f.request(categoryPath, "DELETE"), 409, "CATEGORY_HAS_BANNERS");

  f.removeFile(square.thumbnailUrl);
  const adminItems = CategoryListSchema.parse(await (await f.request(categories)).json()).items;
  assert.equal(adminItems[0].iconUrl, null);
  const cleared = CategorySchema.parse(await (await f.request(categoryPath, "PATCH", { iconImageId: null })).json());
  assert.equal(cleared.iconUrl, null);
  assert.equal((await f.app.request(square.imageUrl, { method: "HEAD" })).status, 200);

  assert.equal((await f.request(`${banners}/${banner.id}`, "DELETE")).status, 204);
  assert.equal((await f.app.request(square.imageUrl, { method: "HEAD" })).status, 404);
  assert.equal((await f.request(categoryPath, "DELETE")).status, 204);
  assert.equal((await f.app.request(wide.imageUrl, { method: "HEAD" })).status, 200);

  const withIcon = CategorySchema.parse(await (await f.request(categories, "POST", { name: "清理", iconImageId: (await f.upload()).id })).json());
  assert.ok(withIcon.iconUrl);
  assert.equal((await f.request(`${categories}/${withIcon.id}`, "DELETE")).status, 204);
  assert.equal((await f.app.request(withIcon.iconUrl, { method: "HEAD" })).status, 404);
});

test("轮播后台接口鉴权，公开列表筛选有效可展示项并按顺序返回", async (t) => {
  const f = await fixture(t);
  const [background, replace] = await Promise.all([f.upload(40, 20), f.upload(40, 20)]);
  const category = CategorySchema.parse(await (await f.request(categories, "POST", { name: "水暖" })).json());
  const empty = CategorySchema.parse(await (await f.request(categories, "POST", { name: "待上架" })).json());
  const base = { categoryId: category.id, backgroundImageId: background.id };
  await failure(await f.app.request(banners), 401, "UNAUTHENTICATED");
  await failure(await f.app.request(banners, { method: "POST" }), 401, "UNAUTHENTICATED");
  await failure(await f.request(banners, "POST", base, "https://elsewhere.example"), 400, "INVALID_ORIGIN");
  await failure(await f.request(banners, "POST", { ...base, title: "字".repeat(17) }), 400, "INVALID_REQUEST");
  await failure(await f.request(banners, "POST", { ...base, categoryId: randomUUID() }), 404, "CATEGORY_NOT_FOUND");
  await failure(await f.request(banners, "POST", { ...base, backgroundImageId: randomUUID() }), 404, "IMAGE_NOT_FOUND");
  const add = async (body: object) => {
    const res = await f.request(banners, "POST", body);
    assert.equal(res.status, 201);
    return AdminBannerSchema.parse(await res.json());
  };
  const hidden = await add(base);
  assert.equal(hidden.isVisible, false);
  assert.equal(hidden.buttonText, "去看看");
  const inactiveTarget = await add({ ...base, categoryId: empty.id, isVisible: true });
  const later = await add({ ...base, isVisible: true, sortOrder: 9, title: "较后" });
  const earlier = await add({ ...base, isVisible: true, sortOrder: 1, title: "较前" });
  const publicBanners = async () => {
    const response = await f.request("/api/banners");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    return BannerListSchema.parse(await response.json()).items;
  };
  assert.deepEqual(await publicBanners(), []);
  const product = await f.request("/api/admin/products", "POST", {
    name: "管", categoryId: category.id, priceCents: 250, unit: "件", specifications: "PVC",
    mainImageId: replace.id, isPublished: true, isOutOfStock: true,
  });
  assert.equal(product.status, 201);
  assert.deepEqual((await publicBanners()).map(({ id }) => id), [earlier.id, later.id]);
  assert.equal((await f.request(`${banners}/${later.id}`, "PATCH", { sortOrder: 0 })).status, 200);
  assert.deepEqual((await publicBanners()).map(({ id }) => id), [later.id, earlier.id]);
  const adminList = async () => AdminBannerListSchema.parse(await (await f.request(banners)).json()).items;
  assert.equal((await adminList()).find(({ id }) => id === inactiveTarget.id)?.isVisible, true);

  f.removeFile(background.imageUrl);
  assert.deepEqual(await publicBanners(), []);
  assert.ok((await adminList()).every(({ backgroundImageUrl }) => backgroundImageUrl === null));
  await failure(await f.request(`${banners}/${later.id}`, "PATCH", { isVisible: true }), 404, "IMAGE_NOT_FOUND");
  assert.equal((await f.request(`${banners}/${later.id}`, "PATCH", { isVisible: false })).status, 200);
  assert.equal((await f.request(`${banners}/${later.id}`, "PATCH", { backgroundImageId: replace.id, isVisible: true })).status, 200);
  assert.deepEqual((await publicBanners()).map(({ id }) => id), [later.id]);
  await failure(await f.request(`${banners}/${randomUUID()}`, "DELETE"), 404, "BANNER_NOT_FOUND");
});

test("轮播图限制包含隐藏项，并发新增不会超过五张，过期图片不能关联", async (t) => {
  const f = await fixture(t);
  const category = CategorySchema.parse(await (await f.request(categories, "POST", { name: "工具" })).json());
  const expired = await f.upload();
  f.advance(24 * 60 * 60 * 1000);
  await failure(await f.request(banners, "POST", { categoryId: category.id, backgroundImageId: expired.id }),
    404, "IMAGE_NOT_FOUND");
  f.cleanup();
  assert.equal((await f.app.request(expired.imageUrl, { method: "HEAD" })).status, 404);
  const image = await f.upload();
  const payload = { categoryId: category.id, backgroundImageId: image.id };
  const requests = await Promise.all(Array.from({ length: maxBanners + 1 }, () => f.request(banners, "POST", payload)));
  assert.equal(requests.filter(({ status }) => status === 201).length, maxBanners);
  const rejected = requests.find(({ status }) => status === 409);
  assert.ok(rejected);
  await failure(rejected, 409, "BANNER_LIMIT_REACHED");
  const list = AdminBannerListSchema.parse(await (await f.request(banners)).json());
  assert.equal(list.total, maxBanners);
  assert.ok(list.items.every(({ isVisible }) => !isVisible));
  assert.equal((await f.request(`${banners}/${list.items[0].id}`, "DELETE")).status, 204);
  assert.equal((await f.request(banners, "POST", payload)).status, 201);
});
