// 购物车只保存在本设备（localStorage），不跨设备同步。
// 读写都做容错：数据损坏、被清空或浏览器禁用存储时，页面仍然可用。
import { useSyncExternalStore } from "react";

export type CartLine = { productId: string; quantity: number };

const KEY = "cart.v1";
export const MAX_QUANTITY = 9999;

let memory: CartLine[] = read();
const listeners = new Set<() => void>();

function isLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.productId === "string" &&
    typeof line.quantity === "number" &&
    Number.isInteger(line.quantity) &&
    line.quantity >= 1 &&
    line.quantity <= MAX_QUANTITY
  );
}

function read(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isLine) : [];
  } catch {
    return [];
  }
}

function write(next: CartLine[]) {
  memory = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 存不进去时只保留在内存里，本次访问仍可继续选货。
  }
  listeners.forEach((listener) => listener());
}

export function addToCart(productId: string, quantity: number) {
  const existing = memory.find((line) => line.productId === productId);
  const total = Math.min((existing?.quantity ?? 0) + quantity, MAX_QUANTITY);
  write(
    existing
      ? memory.map((line) => (line.productId === productId ? { ...line, quantity: total } : line))
      : [...memory, { productId, quantity: total }],
  );
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
