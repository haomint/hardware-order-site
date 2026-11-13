// 五金插图：分类图标、首页横幅和假数据商品图共用。
// 每项是 viewBox="0 0 64 64" 的 SVG 内部内容，全部为静态字符串（不含任何外部数据）。
// 渐变 id 带前缀，同一页面重复使用时定义相同，不会互相干扰。

const defs = `
<defs>
  <linearGradient id="hw-chrome" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f4f7fb"/><stop offset=".45" stop-color="#c9d2de"/><stop offset="1" stop-color="#8d99aa"/>
  </linearGradient>
  <linearGradient id="hw-yellow" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffd84d"/><stop offset="1" stop-color="#f5a300"/>
  </linearGradient>
  <linearGradient id="hw-orange" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ff9a3d"/><stop offset="1" stop-color="#f05a12"/>
  </linearGradient>
  <linearGradient id="hw-blue" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4d8bff"/><stop offset="1" stop-color="#1846c8"/>
  </linearGradient>
  <linearGradient id="hw-dark" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#474d57"/><stop offset="1" stop-color="#22262c"/>
  </linearGradient>
</defs>`;

const drill = `
<rect x="9" y="15" width="7" height="13" rx="3.5" fill="url(#hw-dark)"/>
<rect x="12" y="13" width="33" height="16" rx="6" fill="url(#hw-yellow)"/>
<rect x="15" y="15.5" width="24" height="3" rx="1.5" fill="#fff" opacity=".45"/>
<rect x="44" y="16.5" width="8" height="9" rx="2" fill="url(#hw-dark)"/>
<rect x="51.5" y="19.5" width="9" height="3" rx="1.5" fill="url(#hw-chrome)"/>
<path d="M20 28.5h11.5l-3 17.5H17.5z" fill="url(#hw-dark)"/>
<rect x="30" y="29.5" width="3.2" height="6.5" rx="1.6" fill="#f5a300"/>
<rect x="12.5" y="45" width="22" height="9" rx="2.5" fill="url(#hw-dark)"/>
<rect x="12.5" y="49" width="22" height="2" fill="#f5a300"/>`;

const drillBlue = drill.replace(/hw-yellow/g, "hw-blue").replace(/#f5a300/g, "#e53935");

const wrench = `
<g transform="rotate(-40 32 32)">
  <rect x="28" y="24" width="8" height="34" rx="4" fill="url(#hw-chrome)"/>
  <path d="M21 16a11 11 0 0 1 7-10.2V14h8V5.8A11 11 0 0 1 43 16a11 11 0 0 1-7 10.2V28h-8v-1.8A11 11 0 0 1 21 16z" fill="url(#hw-chrome)"/>
  <rect x="30.5" y="33" width="3" height="18" rx="1.5" fill="#fff" opacity=".5"/>
</g>`;

const screwdriver = `
<g transform="rotate(40 32 32)">
  <rect x="30.5" y="6" width="3" height="26" rx="1.2" fill="url(#hw-chrome)"/>
  <rect x="28.5" y="30" width="7" height="5" rx="1.5" fill="#5b6472"/>
  <rect x="26.5" y="34" width="11" height="24" rx="5" fill="url(#hw-orange)"/>
  <rect x="29" y="37" width="2.4" height="17" rx="1.2" fill="#fff" opacity=".4"/>
</g>`;

const screw = (x: number, y: number, s = 1) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-10" y="0" width="20" height="6.5" rx="3.2" fill="url(#hw-chrome)" stroke="#8d99aa" stroke-width=".8"/>
  <path d="M-5 6.5h10l-.8 28-4.2 7-4.2-7z" fill="url(#hw-chrome)" stroke="#8d99aa" stroke-width=".8"/>
  <path d="M-5 12l10 3M-5 18l9.8 3M-4.7 24l9.4 3M-4.4 30l8.8 3" stroke="#7d8898" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M-4 3.2h8" stroke="#6b7685" stroke-width="1.4" stroke-linecap="round"/>
</g>`;

const nut = (cx: number, cy: number, r: number) => {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return `<polygon points="${pts}" fill="url(#hw-chrome)" stroke="#8d99aa" stroke-width=".8"/>
<circle cx="${cx}" cy="${cy}" r="${(r * 0.45).toFixed(1)}" fill="#e3e8ef" stroke="#8d99aa" stroke-width=".8"/>`;
};

const fasteners = `${screw(22, 8)}${nut(45, 44, 10)}`;

const screws = `${screw(18, 10, 0.9)}${screw(32, 6)}${screw(46, 12, 0.85)}`;

const elbow = `
<path d="M18 52V36a14 14 0 0 1 14-14h16" fill="none" stroke="url(#hw-chrome)" stroke-width="15"/>
<path d="M18 52V36a14 14 0 0 1 14-14h16" fill="none" stroke="#fff" stroke-width="2.5" opacity=".55" transform="translate(-4 -4)"/>
<rect x="8.5" y="46" width="19" height="9" rx="2.5" fill="url(#hw-chrome)" stroke="#8d99aa" stroke-width=".8"/>
<rect x="45" y="12.5" width="9" height="19" rx="2.5" fill="url(#hw-chrome)" stroke="#8d99aa" stroke-width=".8"/>
<ellipse cx="54" cy="22" rx="2.6" ry="6.5" fill="#6b7685"/>`;

const socket = `
<rect x="11" y="11" width="42" height="42" rx="8" fill="#fff" stroke="#d5dce6" stroke-width="1.5"/>
<rect x="16" y="16" width="32" height="32" rx="6" fill="#f3f6fa" stroke="#e1e7ef"/>
<rect x="24" y="22" width="2.6" height="6" rx="1.2" fill="#2b2f36" transform="rotate(-25 25.3 25)"/>
<rect x="37.4" y="22" width="2.6" height="6" rx="1.2" fill="#2b2f36" transform="rotate(25 38.7 25)"/>
<rect x="30.7" y="31" width="2.6" height="6" rx="1.2" fill="#2b2f36"/>
<rect x="24" y="38" width="2.6" height="6" rx="1.2" fill="#2b2f36" transform="rotate(25 25.3 41)"/>
<rect x="37.4" y="38" width="2.6" height="6" rx="1.2" fill="#2b2f36" transform="rotate(-25 38.7 41)"/>`;

const helmet = `
<path d="M12 43a20 20 0 0 1 40 0z" fill="url(#hw-yellow)"/>
<rect x="28.5" y="21" width="7" height="22" rx="3.5" fill="#ffe680"/>
<path d="M17 36a15 15 0 0 1 8-11" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none" opacity=".6"/>
<rect x="7" y="42" width="50" height="7" rx="3.5" fill="#f5a300"/>`;

const tape = `
<rect x="9" y="13" width="38" height="38" rx="11" fill="url(#hw-yellow)"/>
<rect x="9" y="13" width="38" height="38" rx="11" fill="none" stroke="#2b2f36" stroke-width="3"/>
<circle cx="28" cy="32" r="11.5" fill="url(#hw-dark)"/>
<circle cx="28" cy="32" r="4.5" fill="#ffd84d"/>
<path d="M45 43h13v6H45z" fill="#ffe066" stroke="#c9a400" stroke-width=".8"/>
<path d="M48 43v3M51 43v2M54 43v3" stroke="#6b5800" stroke-width=".9"/>
<rect x="57" y="40.5" width="3" height="11" rx="1" fill="url(#hw-chrome)"/>`;

const roll = `
<circle cx="32" cy="32" r="21" fill="url(#hw-dark)"/>
<circle cx="32" cy="32" r="16" fill="none" stroke="#5b616b" stroke-width="1"/>
<circle cx="32" cy="32" r="9.5" fill="#eef2f7" stroke="#c9d2de" stroke-width="2"/>
<path d="M22 16a19 19 0 0 1 12-5" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".35"/>`;

const bulb = `
<circle cx="32" cy="27" r="16" fill="#fff8db" stroke="#f5c84b" stroke-width="2"/>
<path d="M27 30l2.5 6h5L37 30" stroke="#f5a300" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M24 22a9 9 0 0 1 6-6" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".9"/>
<rect x="25" y="41" width="14" height="12" rx="2.5" fill="url(#hw-chrome)" stroke="#8d99aa" stroke-width=".8"/>
<path d="M25 45h14M25 49h14" stroke="#8d99aa" stroke-width="1.2"/>
<rect x="29" y="53" width="6" height="4" rx="1.5" fill="#5b6472"/>`;

const hammer = `
<g transform="rotate(-30 32 32)">
  <rect x="29" y="22" width="7" height="38" rx="3.2" fill="url(#hw-orange)"/>
  <rect x="31" y="27" width="2" height="26" rx="1" fill="#fff" opacity=".4"/>
  <path d="M16 12h26a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H16l-4-3V15z" fill="url(#hw-dark)"/>
  <rect x="18" y="14.5" width="20" height="2.5" rx="1.2" fill="#fff" opacity=".25"/>
</g>`;

const box = `
<path d="M32 10l20 10v24L32 54 12 44V20z" fill="#e7c08a"/>
<path d="M32 10l20 10-20 10-20-10z" fill="#f3d6a8"/>
<path d="M32 30v24l20-10V20z" fill="#d4a46a"/>
<path d="M22 15l20 10v8" stroke="#b9874b" stroke-width="3" fill="none"/>`;

const paint = `
<rect x="14" y="20" width="36" height="34" rx="5" fill="url(#hw-blue)"/>
<ellipse cx="32" cy="20" rx="18" ry="5" fill="#9cbcff"/>
<ellipse cx="32" cy="20" rx="13" ry="3" fill="#2a5be0"/>
<path d="M14 20c0-12 36-12 36 0" stroke="#8d99aa" stroke-width="2.5" fill="none"/>
<rect x="20" y="32" width="24" height="12" rx="2" fill="#fff" opacity=".9"/>`;

/** 全部插图。键名用于按分类名称匹配图标、横幅和假数据商品图。 */
export const ART = {
  drill,
  drillBlue,
  tools: wrench + screwdriver,
  wrench,
  fasteners,
  screws,
  elbow,
  socket,
  helmet,
  tape,
  roll,
  bulb,
  hammer,
  box,
  paint,
} as const;

export type ArtName = keyof typeof ART;

const compact = (svg: string) => svg.replace(/>\s+</g, "><").trim();
const cache = new Map<ArtName, string>();

export function artSvg(name: ArtName): string {
  let svg = cache.get(name);
  if (!svg) {
    svg = compact(defs + ART[name]);
    cache.set(name, svg);
  }
  return svg;
}

/** 按分类名称里的关键词选图标和底色；都不匹配时用纸箱。 */
const rules: { test: RegExp; art: ArtName; tint: string }[] = [
  { test: /电动|电钻|电锤|角磨|充电/, art: "drillBlue", tint: "#eaf1ff" },
  { test: /手动|扳手|螺丝刀|钳|工具/, art: "tools", tint: "#fff1e6" },
  { test: /紧固|螺丝|螺钉|螺栓|螺母|铆|钉/, art: "fasteners", tint: "#eef2f6" },
  { test: /水暖|管件|管材|阀|水管|卫浴/, art: "elbow", tint: "#edf3f8" },
  { test: /电工|电料|插座|开关|电线|线缆/, art: "socket", tint: "#f2f4f8" },
  { test: /劳保|安全|防护|手套|头盔/, art: "helmet", tint: "#fff7e0" },
  { test: /灯|照明/, art: "bulb", tint: "#fff9e6" },
  { test: /胶带|胶布|辅料|胶/, art: "roll", tint: "#f0f2f5" },
  { test: /测量|卷尺|尺|量具/, art: "tape", tint: "#fff7e0" },
  { test: /油漆|涂料|漆/, art: "paint", tint: "#eaf1ff" },
  { test: /锤/, art: "hammer", tint: "#fff1e6" },
];

export function categoryArt(name: string): { art: ArtName; tint: string } {
  return rules.find((rule) => rule.test.test(name)) ?? { art: "box", tint: "#fbf3e8" };
}
