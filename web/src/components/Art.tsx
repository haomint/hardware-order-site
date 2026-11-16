import { ART_VIEWBOX, artSvg, categoryArt } from "./art.ts";
import type { ArtName } from "./art.ts";

/** 渲染一幅内置插图。内容是代码里固定的 SVG，不含外部数据。 */
export function Art({ name, className = "" }: { name: ArtName; className?: string }) {
  return (
    <svg viewBox={ART_VIEWBOX} className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: artSvg(name) }} />
  );
}

/** 分类图标：按分类名称自动选插图和底色。 */
/** 分类图标：店主在后台上传了图标就显示上传的（#69），否则按分类名匹配内置插图。 */
export function CategoryIcon({
  name,
  iconUrl,
  size = 56,
  active = false,
}: {
  name: string;
  iconUrl?: string | null;
  size?: number;
  active?: boolean;
}) {
  const { art } = categoryArt(name);
  return (
    <span
      className={`flex items-center justify-center rounded-[30%] bg-page transition-shadow ${active ? "ring-2 ring-brand ring-offset-2" : ""}`}
      style={{ width: size, height: size }}
    >
      {iconUrl ? (
        <img src={iconUrl} alt="" loading="lazy" className="h-[86%] w-[86%] rounded-[24%] object-cover mix-blend-multiply" />
      ) : (
        <Art name={art} className="h-[86%] w-[86%]" />
      )}
    </span>
  );
}
