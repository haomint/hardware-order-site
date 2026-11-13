import { Art } from "./Art.tsx";
import { BadgeCheckIcon, ChevronRightIcon, PhoneIcon, TruckIcon } from "./icons.tsx";

/**
 * 首页横幅。只写网站真实提供的服务，不写未经店主确认的承诺。
 * 插图用内置 SVG 组合，不依赖网络图片。
 */
export function HeroBanner({ onBrowse }: { onBrowse: () => void }) {
  const points = [
    { icon: BadgeCheckIcon, text: "免注册下单" },
    { icon: PhoneIcon, text: "店家确认价格" },
    { icon: TruckIcon, text: "送货或自提" },
  ];

  return (
    <section className="bg-brand-gradient relative overflow-hidden rounded-[20px] text-white shadow-brand" aria-label="店铺介绍">
      {/* 背景装饰 */}
      <div className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-20 right-16 h-40 w-40 rounded-full bg-white/[0.07]" />

      {/* 插图：电钻为主，卷尺、扳手、弯头陪衬 */}
      {/* 尺寸用固定像素：旧版 iOS 对百分比高度的 SVG 处理不一致。 */}
      <div className="pointer-events-none absolute right-1 top-2 h-[140px] w-[178px]" aria-hidden="true">
        <Art name="wrench" className="absolute left-[18px] top-[18px] h-[70px] w-[70px] -rotate-6 drop-shadow-lg" />
        <Art name="drill" className="absolute right-0 top-0 h-[108px] w-[108px] drop-shadow-xl" />
        <Art name="tape" className="absolute bottom-[2px] left-[24px] h-[56px] w-[56px] drop-shadow-lg" />
        <Art name="elbow" className="absolute bottom-0 right-[14px] h-[50px] w-[50px] drop-shadow-lg" />
      </div>

      <div className="relative px-5 pb-4 pt-5">
        <h2 className="text-[26px] font-black leading-[1.15] tracking-wide">
          五金工具
          <br />
          <span className="bg-gradient-to-r from-[#ffd56b] to-[#ff9a3d] bg-clip-text text-transparent">一站购齐</span>
        </h2>
        <p className="mt-1.5 text-[13px] text-white/80">选好下单 · 店家确认</p>
        <button
          type="button"
          onClick={onBrowse}
          className="mt-3 inline-flex h-11 items-center gap-0.5 rounded-full bg-accent-gradient pl-4 pr-3 text-[15px] font-bold text-white shadow-accent active:scale-95"
        >
          立即选购
          <ChevronRightIcon size={16} strokeWidth={2.6} />
        </button>

        <ul className="mt-4 flex items-center justify-between gap-1 rounded-xl bg-white/[0.13] px-2.5 py-2">
          {points.map(({ icon: Icon, text }, index) => (
            <li key={text} className="flex min-w-0 items-center gap-1 text-[12px] font-medium text-white/95">
              {index > 0 && <span className="mr-1 h-3 w-px bg-white/30" aria-hidden="true" />}
              <Icon size={15} className="shrink-0 text-[#ffd56b]" />
              <span className="whitespace-nowrap">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
