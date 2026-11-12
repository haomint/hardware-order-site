// 假数据：结构严格符合 shared/ 契约，行为按 docs/api/stage-a.md 的约定模拟。
// 仅在 VITE_USE_MOCK 不为 false 时加载，正式构建接真实后端时不会打包进去。
import { ApiError } from "./types.ts";
import type { Category, ListResult, ProductDetail, ProductListItem, ProductQuery, Shop } from "./types.ts";

type MockProduct = ProductDetail & { isPublished: boolean; isPinned: boolean; sortOrder: number };

const img = (name: string) => ({
  imageUrl: `/uploads/mock/${name}.svg`,
  thumbnailUrl: `/uploads/mock/${name}.svg`,
});

const cat = {
  power: "6f1c1b7e-0b0a-4a52-9d0e-1a2b3c4d5e01",
  hand: "6f1c1b7e-0b0a-4a52-9d0e-1a2b3c4d5e02",
  fastener: "6f1c1b7e-0b0a-4a52-9d0e-1a2b3c4d5e03",
  electric: "6f1c1b7e-0b0a-4a52-9d0e-1a2b3c4d5e04",
  empty: "6f1c1b7e-0b0a-4a52-9d0e-1a2b3c4d5e05",
};

const shop: Shop = {
  name: "示例五金店",
  phone: "13800000000",
  wechatContactText: "添加店主微信：shili-wujin",
};

const categories: Category[] = [
  { id: cat.power, name: "电动工具", sortOrder: 1, createdAt: "2026-11-01T02:00:00Z" },
  { id: cat.hand, name: "手动工具", sortOrder: 2, createdAt: "2026-11-01T02:01:00Z" },
  { id: cat.fastener, name: "紧固件", sortOrder: 3, createdAt: "2026-11-01T02:02:00Z" },
  { id: cat.electric, name: "电工辅料", sortOrder: 4, createdAt: "2026-11-01T02:03:00Z" },
  { id: cat.empty, name: "水暖管件", sortOrder: 5, createdAt: "2026-11-01T02:04:00Z" },
];

let seq = 0;
function product(
  fields: Pick<MockProduct, "name" | "brand" | "model" | "categoryId" | "priceCents" | "unit" | "specifications"> &
    Partial<Pick<MockProduct, "isOutOfStock" | "isPublished" | "isPinned" | "sortOrder">> & {
      image: string;
      extra?: string[];
    },
): MockProduct {
  seq += 1;
  const { image, extra = [], ...rest } = fields;
  return {
    id: `9a2d4c6e-1f3b-4d5a-8c7e-${String(seq).padStart(12, "0")}`,
    createdAt: new Date(Date.UTC(2026, 10, 1, 3, seq)).toISOString(),
    isOutOfStock: false,
    isPublished: true,
    isPinned: false,
    sortOrder: 0,
    mainImage: img(image),
    detailImages: extra.map(img),
    ...rest,
  };
}

const products: MockProduct[] = [
  product({
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
  product({
    name: "角磨机 切割打磨抛光机",
    brand: "东成",
    model: "S1M-FF03-100A",
    categoryId: cat.power,
    priceCents: 16800,
    unit: "台",
    image: "grinder",
    specifications: "额定功率：710 W\n砂轮直径：100 mm\n空载转速：11800 转/分\n开关：侧开关\n适用：金属切割、打磨、除锈",
  }),
  product({
    name: "锂电充电式电动螺丝刀套装（含 2 块电池、充电器和 32 件批头）",
    brand: "大有",
    model: "5275",
    categoryId: cat.power,
    priceCents: null,
    unit: "套",
    image: "drill",
    specifications: "电压：12 V\n电池：2.0 Ah × 2\n扭力：25 档可调\n大量采购价格另议，请联系店铺。",
  }),
  product({
    name: "活动扳手 10 寸",
    brand: "世达",
    model: "47204",
    categoryId: cat.hand,
    priceCents: 5850,
    unit: "把",
    image: "wrench",
    specifications: "规格：10 寸（250 mm）\n最大开口：30 mm\n材质：铬钒钢\n表面：镀铬",
  }),
  product({
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
  product({
    name: "钢卷尺 5 米",
    brand: "长城精工",
    model: "",
    categoryId: cat.hand,
    priceCents: 1280,
    unit: "把",
    image: "tape",
    specifications: "长度：5 m\n尺带宽度：19 mm\n刻度：公制\n带自锁和腰扣",
  }),
  product({
    name: "十字沉头自攻螺丝 M4×30",
    brand: "",
    model: "",
    categoryId: cat.fastener,
    priceCents: 950,
    unit: "盒",
    image: "screw",
    specifications: "规格：M4 × 30 mm\n材质：碳钢镀锌\n包装：每盒约 200 颗",
  }),
  product({
    name: "膨胀螺栓 M8×80",
    brand: "",
    model: "M8×80",
    categoryId: cat.fastener,
    priceCents: 120,
    unit: "个",
    image: "screw",
    specifications: "规格：M8 × 80 mm\n材质：碳钢镀锌\n适用：混凝土、实心砖墙固定",
  }),
  product({
    name: "PVC 电工绝缘胶带 黑色",
    brand: "3M",
    model: "1600#",
    categoryId: cat.electric,
    priceCents: 450,
    unit: "卷",
    image: "roll",
    specifications: "宽度：18 mm\n长度：20 m\n耐压：600 V\n颜色：黑色（另有红、黄、蓝、绿，下单时请备注）",
  }),
  product({
    name: "LED 球泡灯 E27 螺口 12W",
    brand: "欧普",
    model: "",
    categoryId: cat.electric,
    priceCents: 1390,
    unit: "只",
    image: "bulb",
    specifications: "功率：12 W\n灯头：E27 螺口\n色温：6500 K 白光\n电压：220 V",
  }),
  // 下架商品：公开接口不应返回它。
  product({
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

function delay<T>(value: T, ms = 280): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function toListItem(p: MockProduct): ProductListItem {
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
    mainImage: p.mainImage,
  };
}

export function getShop(): Promise<Shop> {
  return delay(shop, 120);
}

export function listCategories(): Promise<ListResult<Category>> {
  // 约定：只返回至少关联一件上架商品的分类。
  const used = new Set(products.filter((p) => p.isPublished).map((p) => p.categoryId));
  const items = categories
    .filter((c) => used.has(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  return delay({ items, total: items.length }, 160);
}

export function listProducts(query: ProductQuery = {}): Promise<ListResult<ProductListItem>> {
  const keyword = (query.q ?? "").trim().toLowerCase();
  const page = Number(query.page ?? "1");
  const pageSize = Number(query.pageSize ?? "20");

  const matched = products
    .filter((p) => p.isPublished)
    .filter((p) => !query.categoryId || p.categoryId === query.categoryId)
    .filter((p) => !keyword || [p.name, p.brand, p.model].some((text) => text.toLowerCase().includes(keyword)))
    // 约定：置顶优先，其后按 sortOrder 升序、createdAt 降序。
    .sort(
      (a, b) =>
        Number(b.isPinned) - Number(a.isPinned) ||
        a.sortOrder - b.sortOrder ||
        b.createdAt.localeCompare(a.createdAt),
    );

  const items = matched.slice((page - 1) * pageSize, page * pageSize).map(toListItem);
  return delay({ items, total: matched.length });
}

export function getProduct(id: string): Promise<ProductDetail> {
  const found = products.find((p) => p.id === id && p.isPublished);
  if (!found) {
    return delay(null, 200).then(() => {
      throw new ApiError(404, "PRODUCT_NOT_FOUND", "找不到该商品。");
    });
  }
  return delay({ ...toListItem(found), specifications: found.specifications, detailImages: found.detailImages });
}
