import { useEffect } from "react";

/**
 * 首页和商品详情是白底页面。页面最宽 640px，电脑宽窗口下两侧露出的 body 底色也改为白色，
 * 离开页面时恢复（其他页面是浅灰底）。
 */
export function useWhitePage() {
  useEffect(() => {
    const previous = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "rgb(var(--c-surface))";
    return () => {
      document.body.style.backgroundColor = previous;
    };
  }, []);
}
