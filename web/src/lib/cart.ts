// 购物车只保存在本设备（localStorage），不跨设备同步。
// 读写都做容错：数据损坏、被清空或浏览器禁用存储时，页面仍然可用。
import { useSyncExternalStore } from "react";

/**
 * 购物车里的一行。name / unit / image 是加入时的商品信息备份：
 * 商品后来下架或删除、查不到最新信息时，仍能告诉客户是哪件商品。价格一律以查询到的最新值为准。
 */
export type CartLine = {
  productId: string;
  quantity: number;
  name?: string;
  unit?: string;
  image?: string;
};

export type CartProduct = { id: string; name: string; unit: string; mainImage: { thumbnailUrl: string } };

const KEY = "cart.v1";
export const MAX_QUANTITY = 9999;
/** 与阶段 B 契约一致：一笔订货单最多 100 种商品。 */
export const MAX_LINES = 100;

const optionalText = (value: unknown) => value === undefined || typeof value === "string";

function isLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.productId === "string" &&
    typeof line.quantity === "number" &&
    Number.isInteger(line.quantity) &&
    line.quantity >= 1 &&
    line.quantity <= MAX_QUANTITY &&
    optionalText(line.name) &&
    optionalText(line.unit) &&
    optionalText(line.image)
  );
}

function read(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isLine).slice(0, MAX_LINES) : [];
  } catch {
    return [];
  }
}

// 必须放在 isLine / optionalText 等定义之后：启动时立即读取，提前读取会因这些常量尚未初始化而失败。
let memory: CartLine[] = read();
const listeners = new Set<() => void>();

function write(next: CartLine[]) {
  memory = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 存不进去时只保留在内存里，本次访问仍可继续选货。
  }
  listeners.forEach((listener) => listener());
}

const clamp = (n: number) => Math.max(1, Math.min(MAX_QUANTITY, Math.floor(n)));

/** 加入购物车。已有的商品累加数量；种类已满 100 时返回 "full"，不加入。 */
export function addToCart(product: CartProduct, quantity: number): "added" | "full" {
  const snapshot = { name: product.name, unit: product.unit, image: product.mainImage.thumbnailUrl };
  const existing = memory.find((line) => line.productId === product.id);
  if (existing) {
    write(
      memory.map((line) =>
        line.productId === product.id ? { ...line, ...snapshot, quantity: clamp(line.quantity + quantity) } : line,
      ),
    );
    return "added";
  }
  if (memory.length >= MAX_LINES) return "full";
  write([...memory, { productId: product.id, quantity: clamp(quantity), ...snapshot }]);
  return "added";
}

export function setQuantity(productId: string, quantity: number) {
  write(memory.map((line) => (line.productId === productId ? { ...line, quantity: clamp(quantity) } : line)));
}

/** 在当前数量上增减。总是基于最新存储的值，快速连点也不会少加。 */
export function changeQuantity(productId: string, delta: number) {
  write(memory.map((line) => (line.productId === productId ? { ...line, quantity: clamp(line.quantity + delta) } : line)));
}

/** 移除一行，返回被移除的内容和原位置，用于「撤销」。 */
export function removeFromCart(productId: string): { line: CartLine; index: number } | null {
  const index = memory.findIndex((line) => line.productId === productId);
  if (index === -1) return null;
  const line = memory[index];
  write(memory.filter((_, i) => i !== index));
  return { line, index };
}

/** 撤销移除：放回原来的位置。 */
export function restoreToCart(line: CartLine, index: number) {
  if (memory.some((item) => item.productId === line.productId)) return;
  const next = [...memory];
  next.splice(Math.min(index, next.length), 0, line);
  write(next.slice(0, MAX_LINES));
}

/** 用最新查询到的名称、单位和图片更新备份。 */
export function refreshSnapshots(products: CartProduct[]) {
  const byId = new Map(products.map((p) => [p.id, p]));
  let changed = false;
  const next = memory.map((line) => {
    const product = byId.get(line.productId);
    if (!product) return line;
    const image = product.mainImage.thumbnailUrl;
    if (line.name === product.name && line.unit === product.unit && line.image === image) return line;
    changed = true;
    return { ...line, name: product.name, unit: product.unit, image };
  });
  if (changed) write(next);
}

export function clearCart() {
  write([]);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // 其他标签页修改购物车时保持同步。
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      memory = read();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** 购物车里的商品种类数，用于角标。 */
export function useCartCount(): number {
  return useSyncExternalStore(subscribe, () => memory.length);
}

/** 购物车全部内容。 */
export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, () => memory);
}
