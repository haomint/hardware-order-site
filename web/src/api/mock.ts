// 假数据：结构严格符合 shared/ 契约，行为按 docs/api/stage-a.md 的约定模拟。
// 仅在 VITE_USE_MOCK 不为 false 时加载，正式构建接真实后端时不会打包进去。
// 数据只存在内存里，刷新页面会恢复成初始状态。
import { ApiError, UNAUTHENTICATED_EVENT } from "./types.ts";
// 占位商品图只在假数据模式下使用，随本模块打包；正式版本不包含。
import bulbSvg from "./mock-images/bulb.svg?url";
import drillSvg from "./mock-images/drill.svg?url";
import elbowSvg from "./mock-images/elbow.svg?url";
import grinderSvg from "./mock-images/grinder.svg?url";
import hammerSvg from "./mock-images/hammer.svg?url";
import rollSvg from "./mock-images/roll.svg?url";
import screwSvg from "./mock-images/screw.svg?url";
import socketSvg from "./mock-images/socket.svg?url";
import tapeSvg from "./mock-images/tape.svg?url";
import wrenchSvg from "./mock-images/wrench.svg?url";
import type {
  AdminImage,
  AdminProduct,
  AdminProductQuery,
  AdminSession,
  CartLookupResult,
  Category,
  CategoryInput,
  CategoryPatch,
  CreateProduct,
  ListResult,
  LoginInput,
  ProductDetail,
  ProductListItem,
  ProductQuery,
  Shop,
  UpdateProduct,
} from "./types.ts";

/** 演示账号，仅假数据模式有效。真实后端的账号由部署时设置。 */
export const MOCK_USERNAME = "admin";
export const MOCK_PASSWORD = "demo1234";

type Row = {
  id: string;
  name: string;
  brand: string;
  model: string;
  categoryId: string;
  priceCents: number | null;
  unit: string;
  specifications: string;
  isOutOfStock: boolean;
  isPublished: boolean;
  isPinned: boolean;
  sortOrder: number;
  createdAt: string;
  mainImageId: string | null;
  detailImageIds: string[];
};

function newId(): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

const cat = {
  power: "6f1c1b7e-0b0a-4a52-9d0e-1a2b3c4d5e01",
  hand: "6f1c1b7e-0b0a-4a52-9d0e-1a2b3c4d5e02",
  fastener: "6f1c1b7e-0b0a-4a52-9d0e-1a2b3c4d5e03",
  electric: "6f1c1b7e-0b0a-4a52-9d0e-1a2b3c4d5e04",
  plumbing: "6f1c1b7e-0b0a-4a52-9d0e-1a2b3c4d5e05",
  empty: "6f1c1b7e-0b0a-4a52-9d0e-1a2b3c4d5e06",
};

const shop: Shop = {
  name: "示例五金店",
  phone: "13800000000",
  wechatContactText: "添加店主微信：shili-wujin",
};

let categories: Category[] = [
  { id: cat.power, name: "电动工具", sortOrder: 1, createdAt: "2026-11-01T02:00:00Z" },
  { id: cat.hand, name: "手动工具", sortOrder: 2, createdAt: "2026-11-01T02:01:00Z" },
  { id: cat.fastener, name: "紧固件", sortOrder: 3, createdAt: "2026-11-01T02:02:00Z" },
  { id: cat.electric, name: "电工辅料", sortOrder: 4, createdAt: "2026-11-01T02:03:00Z" },
  { id: cat.plumbing, name: "水暖管件", sortOrder: 5, createdAt: "2026-11-01T02:04:00Z" },
  // 没有商品的分类：商城不显示，后台可见。
  { id: cat.empty, name: "劳保用品", sortOrder: 6, createdAt: "2026-11-01T02:05:00Z" },
];

const images = new Map<string, AdminImage>();
const mockImageUrls: Record<string, string> = {
  bulb: bulbSvg,
  drill: drillSvg,
  elbow: elbowSvg,
  grinder: grinderSvg,
  hammer: hammerSvg,
  roll: rollSvg,
  screw: screwSvg,
  socket: socketSvg,
  tape: tapeSvg,
  wrench: wrenchSvg,
};

function seedImage(name: string): string {
  const url = mockImageUrls[name];
  const image: AdminImage = {
    id: newId(),
    imageUrl: url,
    thumbnailUrl: url,
  };
  images.set(image.id, image);
  return image.id;
}

let seq = 0;
function seed(
  fields: Pick<Row, "name" | "brand" | "model" | "categoryId" | "priceCents" | "unit" | "specifications"> &
    Partial<Pick<Row, "isOutOfStock" | "isPublished" | "isPinned" | "sortOrder">> & {
      image: string;
      extra?: string[];
    },
): Row {
  seq += 1;
  const { image, extra = [], ...rest } = fields;
  return {
    id: `9a2d4c6e-1f3b-4d5a-8c7e-${String(seq).padStart(12, "0")}`,
    createdAt: new Date(Date.UTC(2026, 10, 1, 3, seq)).toISOString(),
    isOutOfStock: false,
    isPublished: true,
    isPinned: false,
    sortOrder: 0,
    mainImageId: seedImage(image),
    detailImageIds: extra.map(seedImage),
    ...rest,
  };
}

let products: Row[] = [
  seed({
    name: "冲击钻 家用多功能手电钻",
    brand: "博世",
    model: "GSB 570",
    categoryId: cat.power,
    priceCents: 32900,
    unit: "台",
    image: "drill",
    extra: ["grinder", "tape"],
    isPinned: true,
    specifications:
      "额定功率：570 W\n空载转速：0–3000 转/分\n夹头直径：13 mm\n功能：平钻 / 冲击钻两用，正反转\n适用：木材、金属、砖墙打孔\n包装内含：主机、辅助手柄、深度尺",
  }),
  seed({
    name: "角磨机 切割打磨抛光机",
    brand: "东成",
    model: "S1M-FF03-100A",
    categoryId: cat.power,
    priceCents: 16800,
    unit: "台",
    image: "grinder",
    specifications: "额定功率：710 W\n砂轮直径：100 mm\n空载转速：11800 转/分\n开关：侧开关\n适用：金属切割、打磨、除锈",
  }),
  seed({
    name: "锂电充电式电动螺丝刀套装（含 2 块电池、充电器和 32 件批头）",
    brand: "大有",
    model: "5275",
    categoryId: cat.power,
    priceCents: null,
    unit: "套",
    image: "drill",
    specifications: "电压：12 V\n电池：2.0 Ah × 2\n扭力：25 档可调\n大量采购价格另议，请联系店铺。",
  }),
  seed({
    name: "活动扳手 10 寸",
    brand: "世达",
    model: "47204",
    categoryId: cat.hand,
    priceCents: 5850,
    unit: "把",
    image: "wrench",
    specifications: "规格：10 寸（250 mm）\n最大开口：30 mm\n材质：铬钒钢\n表面：镀铬",
  }),
  seed({
    name: "羊角锤 玻璃纤维柄",
    brand: "史丹利",
    model: "51-071",
    categoryId: cat.hand,
    priceCents: 4500,
    unit: "把",
    image: "hammer",
    isOutOfStock: true,
    specifications: "锤头重量：16 盎司（约 450 g）\n手柄：玻璃纤维包胶\n用途：敲钉、起钉",
  }),
  seed({
    name: "钢卷尺 5 米",
    brand: "长城精工",
    model: "",
    categoryId: cat.hand,
    priceCents: 1280,
    unit: "把",
    image: "tape",
    specifications: "长度：5 m\n尺带宽度：19 mm\n刻度：公制\n带自锁和腰扣",
  }),
  seed({
    name: "十字沉头自攻螺丝 M4×30",
    brand: "",
    model: "",
    categoryId: cat.fastener,
    priceCents: 950,
    unit: "盒",
    image: "screw",
    specifications: "规格：M4 × 30 mm\n材质：碳钢镀锌\n包装：每盒约 200 颗",
  }),
  seed({
    name: "膨胀螺栓 M8×80",
    brand: "",
    model: "M8×80",
    categoryId: cat.fastener,
    priceCents: 120,
    unit: "个",
    image: "screw",
    specifications: "规格：M8 × 80 mm\n材质：碳钢镀锌\n适用：混凝土、实心砖墙固定",
  }),
  seed({
    name: "PVC 电工绝缘胶带 黑色",
    brand: "3M",
    model: "1600#",
    categoryId: cat.electric,
    priceCents: 450,
    unit: "卷",
    image: "roll",
    specifications: "宽度：18 mm\n长度：20 m\n耐压：600 V\n颜色：黑色（另有红、黄、蓝、绿，下单时请备注）",
  }),
  seed({
    name: "LED 球泡灯 E27 螺口 12W",
    brand: "欧普",
    model: "",
    categoryId: cat.electric,
    priceCents: 1390,
    unit: "只",
    image: "bulb",
    specifications: "功率：12 W\n灯头：E27 螺口\n色温：6500 K 白光\n电压：220 V",
  }),
  seed({
    name: "不锈钢弯头 内丝 DN20",
    brand: "",
    model: "DN20（6 分）",
    categoryId: cat.plumbing,
    priceCents: 1280,
    unit: "个",
    image: "elbow",
    specifications: "规格：DN20（3/4 寸，俗称 6 分）\n材质：304 不锈钢\n连接：内丝\n用途：水管 90° 转弯连接",
  }),
  seed({
    name: "五孔插座面板 86 型",
    brand: "公牛",
    model: "G07Z223",
    categoryId: cat.electric,
    priceCents: 890,
    unit: "个",
    image: "socket",
    specifications: "规格：86 型暗装\n额定：10A 250V\n材质：阻燃 PC\n适用：家装、工程",
  }),
  seed({
    name: "已下架的测试商品",
    brand: "测试",
    model: "X",
    categoryId: cat.power,
    priceCents: 100,
    unit: "个",
    image: "drill",
    isPublished: false,
    specifications: "不应出现在前台。",
  }),
];

// ── 工具 ──────────────────────────────────────────────

function delay<T>(value: T, ms = 260): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function fail(status: number, code: string, message: string, fieldErrors?: Record<string, string>): never {
  throw new ApiError(status, code, message, fieldErrors);
}

/** 让同步的处理函数表现得像一次网络请求：有延迟，出错时返回被拒绝的 Promise。 */
function respond<T>(handler: () => T, ms?: number): Promise<T> {
  return delay(null, ms).then(handler);
}

function publicImage(imageId: string | null) {
  const image = imageId ? images.get(imageId) : undefined;
  // 上架商品必有主图；这里的兜底只为满足类型。
  return { imageUrl: image?.imageUrl ?? "", thumbnailUrl: image?.thumbnailUrl ?? "" };
}

function toListItem(p: Row): ProductListItem {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    model: p.model,
    categoryId: p.categoryId,
    priceCents: p.priceCents,
    unit: p.unit,
    isOutOfStock: p.isOutOfStock,
    createdAt: p.createdAt,
    mainImage: publicImage(p.mainImageId),
  };
}

function toAdmin(p: Row): AdminProduct {
  return {
    ...toListItem(p),
    specifications: p.specifications,
    isPublished: p.isPublished,
    isPinned: p.isPinned,
    sortOrder: p.sortOrder,
    mainImage: (p.mainImageId && images.get(p.mainImageId)) || null,
    detailImages: p.detailImageIds.flatMap((imageId) => images.get(imageId) ?? []),
  };
}

// 约定：置顶优先，其后按 sortOrder 升序、createdAt 降序。
const byProductOrder = (a: Row, b: Row) =>
  Number(b.isPinned) - Number(a.isPinned) || a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt);

// 约定：按 sortOrder 升序，再按 createdAt 升序。
const byCategoryOrder = (a: Category, b: Category) =>
  a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);

function search<T extends Row>(rows: T[], query: ProductQuery): T[] {
  const keyword = (query.q ?? "").trim().toLowerCase();
  return rows
    .filter((p) => !query.categoryId || p.categoryId === query.categoryId)
    .filter((p) => !keyword || [p.name, p.brand, p.model].some((text) => text.toLowerCase().includes(keyword)));
}

function paginate<T>(rows: T[], query: ProductQuery): T[] {
  const page = Number(query.page ?? "1");
  const pageSize = Number(query.pageSize ?? "20");
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

// ── 公开接口 ──────────────────────────────────────────

export function getShop(): Promise<Shop> {
  return delay(shop, 120);
}

export function listCategories(): Promise<ListResult<Category>> {
  return respond(() => {
    // 约定：只返回至少关联一件上架商品的分类。
    const used = new Set(products.filter((p) => p.isPublished).map((p) => p.categoryId));
    const items = categories.filter((c) => used.has(c.id)).sort(byCategoryOrder);
    return { items, total: items.length };
  }, 160);
}

export function listProducts(query: ProductQuery = {}): Promise<ListResult<ProductListItem>> {
  return respond(() => {
    const matched = search(
      products.filter((p) => p.isPublished),
      query,
    ).sort(byProductOrder);
    return { items: paginate(matched, query).map(toListItem), total: matched.length };
  });
}

export function getProduct(productId: string): Promise<ProductDetail> {
  return respond(() => {
    const found = products.find((p) => p.id === productId && p.isPublished);
    if (!found) fail(404, "PRODUCT_NOT_FOUND", "找不到该商品。");
    return {
      ...toListItem(found),
      specifications: found.specifications,
      detailImages: found.detailImageIds.map(publicImage),
    };
  });
}

// ── 购物车与订货（阶段 B） ─────────────────────────────

/** 约定：按输入顺序返回；上架未缺货为 available，上架缺货为 out_of_stock，其余为 unavailable。 */
export function lookupCart(productIds: string[]): Promise<CartLookupResult> {
  return respond(() => {
    if (productIds.length > 100) fail(400, "INVALID_REQUEST", "请检查填写的内容后重试。", { productIds: "最多可提交 100 种商品。" });
    return {
      items: productIds.map((id) => {
        const row = products.find((p) => p.id === id.toLowerCase() && p.isPublished);
        if (!row) return { productId: id, availability: "unavailable" as const };
        return {
          productId: id,
          availability: row.isOutOfStock ? ("out_of_stock" as const) : ("available" as const),
          product: toListItem(row),
        };
      }),
    };
  }, 220);
}

// ── 管理员会话 ────────────────────────────────────────

const SESSION_KEY = "mock.admin";

function isLoggedIn(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function requireAdmin() {
  if (!isLoggedIn()) {
    window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
    fail(401, "UNAUTHENTICATED", "请先登录。");
  }
}

function admin<T>(handler: () => T, ms?: number): Promise<T> {
  return respond(() => {
    requireAdmin();
    return handler();
  }, ms);
}

export function login(input: LoginInput): Promise<AdminSession> {
  return respond(() => {
    if (input.username.trim() !== MOCK_USERNAME || input.password !== MOCK_PASSWORD) {
      fail(401, "INVALID_CREDENTIALS", "账号或密码不正确。");
    }
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // 存不进去时本次登录在刷新后失效，不影响演示。
    }
    return { username: MOCK_USERNAME };
  }, 400);
}

export function getSession(): Promise<AdminSession> {
  return admin(() => ({ username: MOCK_USERNAME }), 120);
}

export function logout(): Promise<void> {
  return respond(() => {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // 忽略。
    }
  }, 120);
}

// ── 后台分类 ──────────────────────────────────────────

function findCategory(categoryId: string): Category {
  const found = categories.find((c) => c.id === categoryId);
  if (!found) fail(404, "CATEGORY_NOT_FOUND", "找不到该分类。");
  return found;
}

function assertCategoryName(name: string, exceptId?: string) {
  if (name === "") fail(400, "INVALID_REQUEST", "请检查填写的内容后重试。", { name: "请填写分类名称。" });
  if (categories.some((c) => c.name === name && c.id !== exceptId)) {
    fail(409, "CATEGORY_NAME_EXISTS", "已有同名分类。");
  }
}

export function listAdminCategories(): Promise<ListResult<Category>> {
  return admin(() => {
    const items = [...categories].sort(byCategoryOrder);
    return { items, total: items.length };
  }, 160);
}

export function createCategory(input: CategoryInput): Promise<Category> {
  return admin(() => {
    const name = input.name.trim();
    assertCategoryName(name);
    const created: Category = {
      id: newId(),
      name,
      sortOrder: input.sortOrder ?? 0,
      createdAt: new Date().toISOString(),
    };
    categories = [...categories, created];
    return created;
  });
}

export function updateCategory(categoryId: string, patch: CategoryPatch): Promise<Category> {
  return admin(() => {
    const current = findCategory(categoryId);
    const name = patch.name === undefined ? current.name : patch.name.trim();
    assertCategoryName(name, categoryId);
    const updated = { ...current, name, sortOrder: patch.sortOrder ?? current.sortOrder };
    categories = categories.map((c) => (c.id === categoryId ? updated : c));
    return updated;
  }, 180);
}

export function deleteCategory(categoryId: string): Promise<void> {
  return admin(() => {
    findCategory(categoryId);
    if (products.some((p) => p.categoryId === categoryId)) {
      fail(409, "CATEGORY_IN_USE", "该分类下还有商品，请先将商品移到其他分类。");
    }
    categories = categories.filter((c) => c.id !== categoryId);
  });
}

// ── 后台商品 ──────────────────────────────────────────

function findRow(productId: string): Row {
  const found = products.find((p) => p.id === productId);
  if (!found) fail(404, "PRODUCT_NOT_FOUND", "找不到该商品。");
  return found;
}

/** 对合并后的完整商品做校验，规则与契约的 ProductWriteSchema 一致。 */
function validate(row: Row) {
  const errors: Record<string, string> = {};
  if (row.name.trim() === "") errors.name = "请填写商品名。";
  if (row.unit.trim() === "") errors.unit = "请填写计量单位。";
  if (row.specifications.trim() === "") errors.specifications = "请填写性能和参数说明。";
  if (row.priceCents !== null && (!Number.isInteger(row.priceCents) || row.priceCents < 0)) {
    errors.priceCents = "请填写整数分，价格面议时填写 null。";
  }
  if (row.isPublished && row.mainImageId === null) errors.mainImageId = "请先上传主图再上架。";
  if (row.mainImageId !== null && row.detailImageIds.includes(row.mainImageId)) {
    errors.detailImageIds = "主图不能同时作为详情图。";
  }
  if (row.detailImageIds.length > 5) errors.detailImageIds = "最多可以添加 5 张详情图。";
  if (Object.keys(errors).length > 0) fail(400, "INVALID_REQUEST", "请检查填写的内容后重试。", errors);

  findCategory(row.categoryId);
  for (const imageId of [row.mainImageId, ...row.detailImageIds]) {
    if (imageId !== null && !images.has(imageId)) {
      fail(404, "IMAGE_NOT_FOUND", "图片不存在或上传已失效，请重新上传。");
    }
  }
}

export function listAdminProducts(query: AdminProductQuery = {}): Promise<ListResult<AdminProduct>> {
  return admin(() => {
    const matched = search(products, query)
      .filter((p) => query.isPublished === undefined || String(p.isPublished) === query.isPublished)
      .filter((p) => query.isOutOfStock === undefined || String(p.isOutOfStock) === query.isOutOfStock)
      .sort(byProductOrder);
    return { items: paginate(matched, query).map(toAdmin), total: matched.length };
  });
}

export function getAdminProduct(productId: string): Promise<AdminProduct> {
  return admin(() => toAdmin(findRow(productId)));
}

export function createProduct(input: CreateProduct): Promise<AdminProduct> {
  return admin(() => {
    const row: Row = {
      id: newId(),
      createdAt: new Date().toISOString(),
      name: input.name.trim(),
      brand: (input.brand ?? "").trim(),
      model: (input.model ?? "").trim(),
      categoryId: input.categoryId,
      priceCents: input.priceCents,
      unit: input.unit.trim(),
      specifications: input.specifications.trim(),
      isOutOfStock: input.isOutOfStock ?? false,
      isPublished: input.isPublished ?? false,
      isPinned: input.isPinned ?? false,
      sortOrder: input.sortOrder ?? 0,
      mainImageId: input.mainImageId ?? null,
      detailImageIds: input.detailImageIds ?? [],
    };
    validate(row);
    products = [...products, row];
    return toAdmin(row);
  }, 400);
}

export function updateProduct(productId: string, patch: UpdateProduct): Promise<AdminProduct> {
  return admin(() => {
    const current = findRow(productId);
    // PATCH 省略的字段保持原值。
    const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    const merged: Row = { ...current, ...defined };
    merged.name = merged.name.trim();
    merged.brand = merged.brand.trim();
    merged.model = merged.model.trim();
    merged.unit = merged.unit.trim();
    merged.specifications = merged.specifications.trim();
    validate(merged);
    products = products.map((p) => (p.id === productId ? merged : p));
    return toAdmin(merged);
  }, 300);
}

export function deleteProduct(productId: string): Promise<void> {
  return admin(() => {
    findRow(productId);
    products = products.filter((p) => p.id !== productId);
  });
}

// ── 图片 ──────────────────────────────────────────────

export function uploadImage(file: File): Promise<AdminImage> {
  return admin(() => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size === 0) {
      fail(400, "INVALID_IMAGE", "请选择符合要求且可以打开的图片。");
    }
    // 真实后端会重新编码并返回 /uploads/ 下的路径；这里用浏览器本地地址代替。
    const url = URL.createObjectURL(file);
    const image: AdminImage = { id: newId(), imageUrl: url, thumbnailUrl: url };
    images.set(image.id, image);
    return image;
  }, 600);
}
