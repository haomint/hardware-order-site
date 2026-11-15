import { formatYuan } from "../lib/format.ts";

type Props = {
  priceCents: number | null;
  unit: string;
  size?: "card" | "detail";
};

/** 参考价展示（苹果风格：黑色加粗，不用彩色）。priceCents 为 null 表示「价格面议」，不显示金额。 */
export function Price({ priceCents, unit, size = "card" }: Props) {
  const detail = size === "detail";

  if (priceCents === null) {
    return <p className={`font-semibold text-ink ${detail ? "text-[24px]" : "text-[16px]"}`}>价格面议</p>;
  }

  return (
    <p className="flex flex-wrap items-baseline text-ink">
      <span className={`tabular headline font-semibold ${detail ? "text-[28px]" : "text-[17px]"}`}>¥{formatYuan(priceCents)}</span>
      <span className={`ml-1 text-faint ${detail ? "text-[15px]" : "text-[13px]"}`}>/{unit}</span>
    </p>
  );
}
