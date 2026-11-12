import { formatYuan } from "../lib/format.ts";

type Props = {
  priceCents: number | null;
  unit: string;
  size?: "card" | "detail";
};

/** 参考价展示。priceCents 为 null 表示「价格面议」，不显示金额。 */
export function Price({ priceCents, unit, size = "card" }: Props) {
  const detail = size === "detail";

  if (priceCents === null) {
    return (
      <p className={`font-semibold text-brand ${detail ? "text-2xl" : "text-base"}`}>
        价格面议
      </p>
    );
  }

  return (
    <p className="flex flex-wrap items-baseline gap-x-1 text-ink">
      <span className={`text-muted ${detail ? "text-sm" : "text-xs"}`}>参考价</span>
      <span className={`tabular font-bold ${detail ? "text-3xl" : "text-lg"}`}>
        <span className={detail ? "text-xl" : "text-sm"}>¥</span>
        {formatYuan(priceCents)}
      </span>
      <span className={`text-muted ${detail ? "text-base" : "text-xs"}`}>/{unit}</span>
    </p>
  );
}
