/** 接口里的金额是「分」的整数，只在显示时转成元。 */
export function formatYuan(cents: number): string {
  const yuan = Math.floor(cents / 100);
  const rest = cents % 100;
  const whole = yuan.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest === 0 ? whole : `${whole}.${String(rest).padStart(2, "0")}`;
}

/** 品牌和型号都可以不填，只拼接有内容的部分。 */
export function brandModel(brand: string, model: string): string {
  return [brand, model].filter((part) => part.trim() !== "").join(" · ");
}
