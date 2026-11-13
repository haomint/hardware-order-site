import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api/index.ts";
import type { Shop } from "../api/index.ts";

const ShopContext = createContext<Shop | null>(null);

/** 店铺资料全站只请求一次。加载失败时各页面按「没有店铺资料」降级显示。 */
export function ShopProvider({ children }: { children: ReactNode }) {
  const [shop, setShop] = useState<Shop | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getShop().then(
      (data) => {
        if (cancelled) return;
        setShop(data);
        document.title = data.name;
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return <ShopContext.Provider value={shop}>{children}</ShopContext.Provider>;
}

export function useShop(): Shop | null {
  return useContext(ShopContext);
}
