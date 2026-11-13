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
    return <p className={`font-bold text-brand ${detail ? "text-2xl" : "text-[15px]"}`}>价格面议</p>;
  }

  const text = formatYuan(priceCents);
  const dot = text.indexOf(".");
  const whole = dot === -1 ? text : text.slice(0, dot);
  const cents = dot === -1 ? "" : text.slice(dot);

  return (
    <p className="flex flex-wrap items-baseline text-accent">
      <span className={`font-bold ${detail ? "mr-0.5 text-lg" : "text-[13px]"}`}>¥</span>
      <span className={`tabular font-extrabold leading-none tracking-tight ${detail ? "text-[32px]" : "text-[20px]"}`}>{whole}</span>
      {cents && <span className={`tabular font-bold ${detail ? "text-lg" : "text-[14px]"}`}>{cents}</span>}
      <span className={`ml-0.5 font-normal text-faint ${detail ? "text-[15px]" : "text-[12px]"}`}>/{unit}</span>
    </p>
  );
}
