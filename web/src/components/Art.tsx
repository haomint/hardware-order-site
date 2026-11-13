import { artSvg, categoryArt } from "./art.ts";
import type { ArtName } from "./art.ts";

/** 渲染一幅内置插图。内容是代码里固定的 SVG，不含外部数据。 */
export function Art({ name, className = "" }: { name: ArtName; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: artSvg(name) }} />
  );
}

/** 分类图标：按分类名称自动选插图和底色。 */
export function CategoryIcon({ name, size = 56, active = false }: { name: string; size?: number; active?: boolean }) {
  const { art, tint } = categoryArt(name);
  return (
    <span
      className={`flex items-center justify-center rounded-2xl transition-shadow ${active ? "ring-2 ring-brand ring-offset-2" : ""}`}
      style={{ width: size, height: size, background: tint }}
    >
      <Art name={art} className="h-[78%] w-[78%]" />
    </span>
  );
}
