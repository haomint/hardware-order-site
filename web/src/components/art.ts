// 五金插图（写实渲染风格）：分类图标、首页横幅和假数据商品图共用。
// 每项是 viewBox="0 0 128 128" 的 SVG 内部内容，全部为代码里的静态字符串（不含任何外部数据）。
// 金属用多段明暗交替的渐变模拟反光，塑料用高光叠层模拟光泽，底部有接触阴影。
// 渐变 id 带 r- 前缀；同一页面重复使用时定义完全相同，不会互相干扰。

export const ART_VIEWBOX = "0 0 128 128";

const defs = `
<defs>
  <linearGradient id="r-chromeV" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f8fafc"/><stop offset=".14" stop-color="#d5dbe1"/><stop offset=".3" stop-color="#8b949d"/>
    <stop offset=".45" stop-color="#eef1f4"/><stop offset=".6" stop-color="#b4bbc2"/><stop offset=".8" stop-color="#666f78"/>
    <stop offset=".92" stop-color="#a7aeb5"/><stop offset="1" stop-color="#d9dde1"/>
  </linearGradient>
  <linearGradient id="r-chromeH" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#7c858e"/><stop offset=".18" stop-color="#e9edf1"/><stop offset=".34" stop-color="#9aa2aa"/>
    <stop offset=".55" stop-color="#f6f8fa"/><stop offset=".72" stop-color="#a3abb3"/><stop offset=".88" stop-color="#5e6770"/><stop offset="1" stop-color="#9aa2aa"/>
  </linearGradient>
  <linearGradient id="r-steel" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#a9b0b7"/><stop offset=".45" stop-color="#5a626a"/><stop offset=".7" stop-color="#3b4249"/><stop offset="1" stop-color="#6f777f"/>
  </linearGradient>
  <linearGradient id="r-yellow" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffe680"/><stop offset=".3" stop-color="#ffc91f"/><stop offset=".72" stop-color="#eba500"/><stop offset="1" stop-color="#b47a00"/>
  </linearGradient>
  <linearGradient id="r-blue" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#6aa0ff"/><stop offset=".32" stop-color="#2d6bf0"/><stop offset=".75" stop-color="#1a45bd"/><stop offset="1" stop-color="#0d2672"/>
  </linearGradient>
  <linearGradient id="r-orange" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffb066"/><stop offset=".35" stop-color="#ff7a1f"/><stop offset=".8" stop-color="#d9520c"/><stop offset="1" stop-color="#9c3a07"/>
  </linearGradient>
  <linearGradient id="r-rubber" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#565c64"/><stop offset=".25" stop-color="#2f343a"/><stop offset=".8" stop-color="#16191d"/><stop offset="1" stop-color="#2a2e33"/>
  </linearGradient>
  <linearGradient id="r-white" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f1f4f8"/><stop offset="1" stop-color="#d6dde6"/>
  </linearGradient>
  <linearGradient id="r-whiteIn" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#e3e8ef"/><stop offset=".5" stop-color="#f7f9fb"/><stop offset="1" stop-color="#ffffff"/>
  </linearGradient>
  <linearGradient id="r-gloss" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="r-blade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff3a6"/><stop offset=".5" stop-color="#f2d430"/><stop offset="1" stop-color="#b89a00"/>
  </linearGradient>
  <radialGradient id="r-shadow" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="#0b1a33" stop-opacity=".32"/><stop offset=".6" stop-color="#0b1a33" stop-opacity=".12"/><stop offset="1" stop-color="#0b1a33" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="r-tape" cx=".38" cy=".34" r=".7">
    <stop offset="0" stop-color="#4a5058"/><stop offset=".55" stop-color="#1f2328"/><stop offset="1" stop-color="#0e1013"/>
  </radialGradient>
  <radialGradient id="r-glass" cx=".4" cy=".35" r=".7">
    <stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f4f7fb" stop-opacity=".95"/><stop offset="1" stop-color="#c9d5e4" stop-opacity=".9"/>
  </radialGradient>
  <radialGradient id="r-glow" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="#fff4c2"/><stop offset="1" stop-color="#ffe27a" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="r-kraft" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#e2bd86"/><stop offset="1" stop-color="#b98a4f"/>
  </linearGradient>
  <mask id="r-jaw">
    <rect x="-20" y="-20" width="170" height="170" fill="#fff"/>
    <path d="M-6 56.5H25a7.5 7.5 0 0 1 0 15H-6z" fill="#000" transform="rotate(-15 24 64)"/>
  </mask>
</defs>`;

const shadow = (cx: number, cy: number, rx: number, ry = 5) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#r-shadow)"/>`;

/** 充电式电钻（侧面，朝右）。body 是机身渐变，accent 是电池色带。 */
const drillOf = (body: string, accent: string) => `
${shadow(66, 117, 46, 5)}
<rect x="24" y="96" width="50" height="17" rx="4" fill="url(#r-rubber)"/>
<rect x="24" y="96" width="50" height="5.5" rx="2.5" fill="${accent}"/>
<rect x="28" y="104" width="42" height="1.5" rx=".75" fill="#fff" opacity=".12"/>
<circle cx="61" cy="108.5" r="1.3" fill="#7dff8a"/><circle cx="65" cy="108.5" r="1.3" fill="#7dff8a"/><circle cx="69" cy="108.5" r="1.3" fill="#3a3f45"/>
<path d="M39 63h21l-4.5 34H34.5z" fill="url(#r-rubber)"/>
<path d="M41 70l15 0M40.5 76h14.6M40 82h14.2M39.4 88h13.8" stroke="#454b52" stroke-width="1.6" stroke-linecap="round"/>
<path d="M58 66c4 0 5 2 4.4 6l-1.6 9c-.5 2.5-3.6 2.5-4 0l-.8-11z" fill="${accent}"/>
<rect x="44" y="61" width="9" height="5" rx="2" fill="#2a2e33"/>
<rect x="13" y="33" width="17" height="31" rx="8.5" fill="url(#r-rubber)"/>
<path d="M17 41l7-3M17 47l7-3M17 53l7-3M17 59l7-3" stroke="#555b62" stroke-width="1.7" stroke-linecap="round"/>
<path d="M24 31h62a9 9 0 0 1 9 9v17a9 9 0 0 1-9 9H24z" fill="${body}"/>
<path d="M24 31h62a9 9 0 0 1 9 9v2H24z" fill="url(#r-gloss)" opacity=".55"/>
<rect x="30" y="34" width="52" height="4" rx="2" fill="#fff" opacity=".45"/>
<rect x="44" y="45" width="30" height="11" rx="3" fill="#1d2025" opacity=".88"/>
<rect x="47" y="48.5" width="16" height="1.6" rx=".8" fill="#fff" opacity=".5"/>
<rect x="47" y="51.6" width="10" height="1.4" rx=".7" fill="#fff" opacity=".3"/>
<rect x="93" y="35" width="11" height="27" rx="3" fill="url(#r-rubber)"/>
<path d="M96 36v25M99 36v25M102 36v25" stroke="#4d535a" stroke-width="1.1"/>
<path d="M104 38.5l14 3.5v13l-14 3.5z" fill="url(#r-chromeV)"/>
<path d="M107 40v17M110.5 41v15M114 42v13" stroke="#6f7881" stroke-width=".9" opacity=".8"/>
<rect x="118" y="46.6" width="9" height="3.8" rx="1" fill="url(#r-chromeV)"/>`;

const drill = drillOf("url(#r-yellow)", "#f2b100");
const drillBlue = drillOf("url(#r-blue)", "#e53935");

/** 两用扳手：一头开口、一头梅花，手柄中间有凹槽。 */
const wrench = `
${shadow(64, 112, 44, 4)}
<g transform="rotate(-35 64 64)">
  <path d="M36 57.5L92 59.5v9L36 70.5z" fill="url(#r-chromeV)"/>
  <rect x="46" y="61.8" width="38" height="4.4" rx="2.2" fill="url(#r-steel)" opacity=".5"/>
  <g mask="url(#r-jaw)"><circle cx="24" cy="64" r="17.5" fill="url(#r-chromeV)"/></g>
  <circle cx="104" cy="64" r="13.5" fill="url(#r-chromeV)"/>
  <circle cx="104" cy="64" r="7.2" fill="#353b42"/>
  <path d="M104 57.2l3.4 2v1l2.6 2.6v2.4l-2.6 2.6v1L104 70.8l-3.4-2v-1l-2.6-2.6v-2.4l2.6-2.6v-1z" fill="none" stroke="#7d868f" stroke-width=".9"/>
  <path d="M14 52a17 17 0 0 1 14-5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".7" fill="none"/>
  <path d="M40 59.5L88 61" stroke="#fff" stroke-width="1.2" opacity=".7"/>
</g>`;

/** 螺丝刀：橙色握柄带黑色防滑胶，镀铬刀杆。 */
const screwdriver = `
<g transform="rotate(35 64 64)">
  <rect x="14" y="61.6" width="50" height="4.8" rx="1.5" fill="url(#r-chromeV)"/>
  <path d="M14 61.6L7.5 63.3v1.4L14 66.4z" fill="url(#r-steel)"/>
  <rect x="61" y="57" width="10" height="14" rx="2" fill="url(#r-chromeV)"/>
  <rect x="70" y="53" width="46" height="22" rx="10" fill="url(#r-orange)"/>
  <rect x="80" y="53" width="9" height="22" fill="url(#r-rubber)"/>
  <rect x="95" y="53" width="9" height="22" fill="url(#r-rubber)"/>
  <rect x="73" y="56" width="40" height="4" rx="2" fill="#fff" opacity=".35"/>
</g>`;

/** 一颗十字自攻螺丝（竖放），用 transform 定位和缩放。 */
const screw = (x: number, y: number, scale = 1, angle = 0) => `
<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})">
  <path d="M-6 6h12l-1.2 44L0 60l-4.8-10z" fill="url(#r-chromeH)"/>
  ${Array.from({ length: 8 }, (_, i) => {
    const t = 9 + i * 5.2;
    const w = 6 - i * 0.12;
    return `<path d="M${-w - 1.5} ${t}l${2 * w + 3} 3.4v2.2l${-(2 * w + 3)} -3.4z" fill="url(#r-chromeH)" stroke="#6b737c" stroke-width=".5"/>`;
  }).join("")}
  <path d="M-15 1.5a15 5 0 0 0 30 0v4a15 5 0 0 1-30 0z" fill="url(#r-chromeH)"/>
  <ellipse cx="0" cy="1.5" rx="15" ry="5" fill="url(#r-chromeV)"/>
  <path d="M-6 1.5h12M0 -1.8v6.6" stroke="#4a5158" stroke-width="2.6" stroke-linecap="round"/>
</g>`;

/** 六角螺母：有厚度，内孔有螺纹圈。 */
const nut = (cx: number, cy: number, r: number) => {
  const hex = (dy: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + dy + r * 0.62 * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
  return `
<polygon points="${hex(r * 0.42)}" fill="#5e666e"/>
<path d="M${cx - r * 0.87} ${cy}v${r * 0.42}l${r * 0.87} ${r * 0.31}l${r * 0.87} ${-r * 0.31}v${-r * 0.42}z" fill="url(#r-chromeH)"/>
<polygon points="${hex(0)}" fill="url(#r-chromeV)" stroke="#8b949d" stroke-width=".6"/>
<ellipse cx="${cx}" cy="${cy}" rx="${r * 0.46}" ry="${r * 0.29}" fill="#3e454c"/>
<ellipse cx="${cx}" cy="${cy}" rx="${r * 0.38}" ry="${r * 0.23}" fill="none" stroke="#7d868f" stroke-width=".8"/>
<ellipse cx="${cx}" cy="${cy}" rx="${r * 0.3}" ry="${r * 0.18}" fill="none" stroke="#6a737c" stroke-width=".7"/>`;
};

const fasteners = `${shadow(64, 116, 46, 5)}${screw(44, 26, 1.25, -8)}${nut(88, 92, 22)}`;
const screws = `${shadow(64, 116, 50, 5)}${screw(30, 34, 1.05, -14)}${screw(64, 20, 1.3, 0)}${screw(98, 36, 1.0, 12)}`;

/** 90° 内丝弯头：两段圆管加转角，明暗沿管身走向一致。 */
const elbow = `
${shadow(66, 118, 46, 5)}
<defs>
  <linearGradient id="r-elbowLegV" x1="22" y1="0" x2="58" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#6d767f"/><stop offset=".22" stop-color="#bcc3ca"/><stop offset=".48" stop-color="#f4f6f8"/><stop offset=".72" stop-color="#a6aeb6"/><stop offset="1" stop-color="#59616a"/>
  </linearGradient>
  <linearGradient id="r-elbowLegH" x1="0" y1="26" x2="0" y2="62" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#6d767f"/><stop offset=".22" stop-color="#bcc3ca"/><stop offset=".48" stop-color="#f4f6f8"/><stop offset=".72" stop-color="#a6aeb6"/><stop offset="1" stop-color="#59616a"/>
  </linearGradient>
  <radialGradient id="r-elbowBend" cx="58" cy="62" r="36" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#59616a"/><stop offset=".28" stop-color="#a6aeb6"/><stop offset=".52" stop-color="#f4f6f8"/><stop offset=".78" stop-color="#bcc3ca"/><stop offset="1" stop-color="#6d767f"/>
  </radialGradient>
</defs>
<path d="M22 62A36 36 0 0 1 58 26v36z" fill="url(#r-elbowBend)"/>
<rect x="22" y="61.5" width="36" height="40" fill="url(#r-elbowLegV)"/>
<rect x="57.5" y="26" width="40" height="36" fill="url(#r-elbowLegH)"/>
<rect x="18" y="98" width="44" height="12" rx="2.5" fill="url(#r-chromeH)"/>
<rect x="95" y="22" width="12" height="44" rx="2.5" fill="url(#r-chromeV)"/>
<ellipse cx="107" cy="44" rx="5.5" ry="19" fill="#4b525a"/>
<ellipse cx="107" cy="44" rx="4" ry="15" fill="#2c3238"/>
<path d="M104.5 32c2 3 2 21 0 24M107 30.5c2.2 4 2.2 23 0 27" stroke="#6f7881" stroke-width=".8" fill="none"/>
<path d="M28 66v32" stroke="#fff" stroke-width="2.4" opacity=".55" stroke-linecap="round"/>`;

/** 五孔插座面板：白色面板有倒角，插孔有内阴影。 */
const socket = `
<rect x="20" y="22" width="92" height="92" rx="15" fill="#0b1a33" opacity=".08"/>
<rect x="16" y="16" width="92" height="92" rx="15" fill="url(#r-white)" stroke="#d3dae3" stroke-width="1.2"/>
<rect x="24" y="24" width="76" height="76" rx="10" fill="url(#r-whiteIn)" stroke="#e1e6ed"/>
<path d="M24 34a10 10 0 0 1 10-10h56" stroke="#fff" stroke-width="2" fill="none" opacity=".9"/>
${[
  [44, 40, -28],
  [80, 40, 28],
].map(([x, y, a]) => `<rect x="${x - 2.6}" y="${y - 7}" width="5.2" height="14" rx="2.2" fill="#23272c" transform="rotate(${a} ${x} ${y})"/>`).join("")}
<rect x="59.4" y="58" width="5.2" height="13" rx="2.2" fill="#23272c"/>
${[
  [46, 82, 28],
  [78, 82, -28],
].map(([x, y, a]) => `<rect x="${x - 2.6}" y="${y - 7}" width="5.2" height="14" rx="2.2" fill="#23272c" transform="rotate(${a} ${x} ${y})"/>`).join("")}`;

/** 安全帽：亮面黄色，中间加强筋，帽檐。 */
const helmet = `
${shadow(64, 108, 52, 6)}
<path d="M18 84C18 50 38 30 64 30s46 20 46 54z" fill="url(#r-yellow)"/>
<path d="M56 31.5c3-1 13-1 16 0V84H56z" fill="#ffe27a" opacity=".85"/>
<path d="M56 31.5c3-1 13-1 16 0" stroke="#fff" stroke-width="1.5" opacity=".6" fill="none"/>
<path d="M38 40c6-5 12-7 16-8v52H44c-2-18-4-30-6-44z" fill="#fff" opacity=".22"/>
<ellipse cx="40" cy="50" rx="9" ry="14" fill="#fff" opacity=".35" transform="rotate(28 40 50)"/>
<path d="M8 84c18-4 38-6 56-6s38 2 56 6v6c-18-3-38-5-56-5S26 87 8 90z" fill="#e6a100"/>
<path d="M8 84c18-4 38-6 56-6s38 2 56 6" stroke="#ffe27a" stroke-width="1.6" fill="none"/>
<path d="M8 90c18-3 38-5 56-5s38 2 56 5v2c-18-3-38-4-56-4S26 89 8 92z" fill="#9c6c00"/>`;

/** 钢卷尺：黄色外壳包黑色橡胶，拉出一段尺带。 */
const tape = `
${shadow(64, 114, 48, 5)}
<rect x="12" y="22" width="86" height="86" rx="24" fill="url(#r-rubber)"/>
<rect x="20" y="30" width="70" height="70" rx="17" fill="url(#r-yellow)"/>
<path d="M28 34h52a12 12 0 0 1 8 3" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55" fill="none"/>
<circle cx="55" cy="65" r="21" fill="url(#r-rubber)"/>
<circle cx="55" cy="65" r="12" fill="url(#r-yellow)"/>
<circle cx="55" cy="65" r="4" fill="url(#r-chromeV)"/>
<rect x="44" y="16" width="22" height="10" rx="4" fill="url(#r-rubber)"/>
<rect x="96" y="92" width="24" height="10" fill="url(#r-blade)"/>
<path d="M99 92v4M102 92v2.5M105 92v4M108 92v2.5M111 92v4M114 92v2.5" stroke="#3a3200" stroke-width=".9"/>
<rect x="118" y="87" width="5.5" height="19" rx="1.5" fill="url(#r-chromeH)"/>`;

/** 电工胶带：亮黑色胶卷，纸芯露出。 */
const roll = `
${shadow(66, 116, 46, 5)}
<circle cx="68" cy="66" r="44" fill="#0c0e11"/>
<circle cx="62" cy="60" r="44" fill="url(#r-tape)"/>
<circle cx="62" cy="60" r="38" fill="none" stroke="#3a3f46" stroke-width=".8" opacity=".7"/>
<path d="M30 40a40 40 0 0 1 30-18" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".22" fill="none"/>
<circle cx="62" cy="60" r="19" fill="#efe8da"/>
<circle cx="64" cy="62" r="15" fill="#cbbfa6"/>
<circle cx="62" cy="60" r="19" fill="none" stroke="#d9cfba" stroke-width="2"/>`;

/** LED 球泡：磨砂玻璃罩，铝螺口灯头。 */
const bulb = `
${shadow(64, 118, 26, 4)}
<circle cx="64" cy="46" r="34" fill="url(#r-glow)" opacity=".7"/>
<path d="M41 66c-6-6-9-12-9-20a32 32 0 0 1 64 0c0 8-3 14-9 20-5 5-7 10-7 18H48c0-8-2-13-7-18z" fill="url(#r-glass)" stroke="#bccadb" stroke-width="1"/>
<path d="M44 30a24 24 0 0 1 16-10" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".9" fill="none"/>
<rect x="54" y="52" width="20" height="10" rx="3" fill="#fde68a" opacity=".85"/>
<rect x="47" y="84" width="34" height="8" rx="2" fill="#e8ebef" stroke="#c4cbd3" stroke-width=".8"/>
<rect x="48" y="92" width="32" height="18" rx="2" fill="url(#r-chromeH)"/>
<path d="M48 96l32-2M48 101l32-2M48 106l32-2" stroke="#6b747d" stroke-width="1.4" opacity=".8"/>
<path d="M54 110h20l-4 6h-12z" fill="#2f343a"/>`;

/** 羊角锤：抛光锤头，纤维柄配橡胶握把。 */
const hammer = `
${shadow(64, 116, 44, 5)}
<g transform="rotate(-28 64 64)">
  <rect x="55" y="50" width="16" height="68" rx="6" fill="url(#r-orange)"/>
  <rect x="55" y="80" width="16" height="38" rx="6" fill="url(#r-rubber)"/>
  <path d="M57 86h12M57 92h12M57 98h12M57 104h12M57 110h12" stroke="#454b52" stroke-width="1.3"/>
  <rect x="58" y="52" width="3" height="26" rx="1.5" fill="#fff" opacity=".4"/>
  <path d="M40 34h42v20H40z" fill="url(#r-chromeV)"/>
  <rect x="80" y="28" width="22" height="32" rx="4" fill="url(#r-chromeV)"/>
  <path d="M42 31c-19 0-31 8-38 24l12 7c6-12 13-17 26-17z" fill="url(#r-chromeV)"/>
  <path d="M10 56l6 3.5" stroke="#5a626a" stroke-width="1.2"/>
  <path d="M42 38c-14 0-23 6-29 16" stroke="#3f464d" stroke-width="2.4" fill="none" opacity=".6"/>
  <path d="M40 33.5c-14 0-24 5-31 16" stroke="#fff" stroke-width="1.6" fill="none" opacity=".6"/>
  <rect x="44" y="36" width="34" height="3" rx="1.5" fill="#fff" opacity=".65"/>
</g>`;

/** 纸箱：牛皮纸色，封箱胶带。 */
const box = `
${shadow(64, 114, 48, 5)}
<path d="M64 20l42 18v50l-42 22-42-22V38z" fill="url(#r-kraft)"/>
<path d="M64 20l42 18-42 19-42-19z" fill="#edd2a6"/>
<path d="M64 57v53l42-22V38z" fill="#b8874a"/>
<path d="M42 29l42 19v14l-6 3V51L36 32z" fill="#d9b27a" opacity=".9"/>
<path d="M64 57l-42-19" stroke="#c99a5d" stroke-width="1"/>`;

/** 油漆桶：金属桶身，白色标签。 */
const paint = `
${shadow(64, 116, 42, 5)}
<path d="M24 40h80v62c0 6-18 10-40 10s-40-4-40-10z" fill="url(#r-chromeH)"/>
<ellipse cx="64" cy="40" rx="40" ry="10" fill="#c9d0d7"/>
<ellipse cx="64" cy="40" rx="34" ry="7.5" fill="url(#r-blue)"/>
<path d="M24 40c0-26 80-26 80 0" stroke="#5e666e" stroke-width="3" fill="none"/>
<path d="M26 58h76v30H26z" fill="#fff" opacity=".95"/>
<rect x="34" y="66" width="34" height="5" rx="2.5" fill="#1f5af6"/>
<rect x="34" y="75" width="22" height="3.5" rx="1.75" fill="#9aa3ad"/>`;

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

const compact = (svg: string) => svg.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
const cache = new Map<ArtName, string>();

export function artSvg(name: ArtName): string {
  let svg = cache.get(name);
  if (!svg) {
    svg = compact(defs + ART[name]);
    cache.set(name, svg);
  }
  return svg;
}

/** 分类图标底色统一用浅灰蓝，接近产品图展示台的质感。 */
const TILE = "linear-gradient(160deg, #f6f9fd 0%, #e9eff7 100%)";

/** 按分类名称里的关键词选图标；都不匹配时用纸箱。 */
const rules: { test: RegExp; art: ArtName }[] = [
  { test: /电动|电钻|电锤|角磨|充电/, art: "drillBlue" },
  { test: /手动|扳手|螺丝刀|钳|工具/, art: "tools" },
  { test: /紧固|螺丝|螺钉|螺栓|螺母|铆|钉/, art: "fasteners" },
  { test: /水暖|管件|管材|阀|水管|卫浴/, art: "elbow" },
  { test: /电工|电料|插座|开关|电线|线缆/, art: "socket" },
  { test: /劳保|安全|防护|手套|头盔/, art: "helmet" },
  { test: /灯|照明/, art: "bulb" },
  { test: /胶带|胶布|辅料|胶/, art: "roll" },
  { test: /测量|卷尺|尺|量具/, art: "tape" },
  { test: /油漆|涂料|漆/, art: "paint" },
  { test: /锤/, art: "hammer" },
];

export function categoryArt(name: string): { art: ArtName; tint: string } {
  return { art: rules.find((rule) => rule.test.test(name))?.art ?? "box", tint: TILE };
}
