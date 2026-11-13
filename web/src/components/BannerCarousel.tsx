import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Art } from "./Art.tsx";
import { BadgeCheckIcon, ChevronRightIcon, PhoneIcon, TruckIcon } from "./icons.tsx";

/** 点击横幅后要做的事：滚动到商品列表，或进入某个分类（找不到分类时按关键词搜索）。 */
export type BannerAction = { kind: "list" } | { kind: "category"; match: RegExp; keyword: string };

type Slide = {
  key: string;
  title: string;
  highlight: string;
  /** 副标题的词组。窄屏放不下时只在词组之间换行，不会把一个词拆开。 */
  sub: string[];
  /** 词组之间的连接符，默认「 · 」。 */
  subJoin?: string;
  cta: string;
  /** 背景墙面的色调，每张略有不同。 */
  wall: string;
  action: BannerAction;
  /** 摆在工作台上的插图，坐标相对右侧 176×140 的区域，底边就是台面。 */
  art: ReactNode;
  /**
   * 以后换成店主自己的横幅照片时填这里（放在 web/public/banners/ 下），
   * 有图片时只显示图片，文字和插图不再显示。
   */
  image?: string;
};

const AUTOPLAY_MS = 4000;
/** 手指离开后多久恢复自动播放。 */
const RESUME_MS = 3000;

// 横幅内容：只写网站真实提供的服务和商品类别，不写未经店主确认的承诺。
const slides: Slide[] = [
  {
    key: "all",
    title: "五金工具",
    highlight: "一站购齐",
    sub: ["工地工厂", "维修安装", "日常家用"],
    cta: "立即选购",
    wall: "linear-gradient(180deg, #eef4fc 0%, #d4e1f2 100%)",
    action: { kind: "list" },
    art: (
      <>
        <Art name="wrench" className="absolute bottom-[50px] left-[30px] h-[68px] w-[68px]" />
        <Art name="drill" className="absolute bottom-[2px] right-[16px] h-[112px] w-[112px]" />
        <Art name="tape" className="absolute bottom-[-4px] left-[14px] h-[60px] w-[60px]" />
        <Art name="elbow" className="absolute bottom-[-6px] right-[-6px] h-[56px] w-[56px]" />
      </>
    ),
  },
  {
    key: "power",
    title: "电动工具",
    highlight: "专区",
    sub: ["电钻", "角磨机", "电批"],
    cta: "去看看",
    wall: "linear-gradient(180deg, #f5f0e8 0%, #e3d7c7 100%)",
    action: { kind: "category", match: /电动|电钻|电锤/, keyword: "电" },
    art: (
      <>
        <Art name="drill" className="absolute bottom-[0px] left-[0px] h-[86px] w-[86px]" />
        <Art name="drillBlue" className="absolute bottom-[-2px] right-[0px] h-[120px] w-[120px]" />
      </>
    ),
  },
  {
    key: "fastener",
    title: "紧固件",
    highlight: "专区",
    sub: ["自攻螺丝", "膨胀螺栓", "螺母"],
    cta: "去看看",
    wall: "linear-gradient(180deg, #f0f3f7 0%, #d7dee7 100%)",
    action: { kind: "category", match: /紧固|螺丝|螺栓|螺母/, keyword: "螺" },
    art: (
      <>
        <Art name="screws" className="absolute bottom-[-2px] right-[6px] h-[116px] w-[116px]" />
        <Art name="fasteners" className="absolute bottom-[6px] left-[-2px] h-[72px] w-[72px]" />
      </>
    ),
  },
  {
    key: "home",
    title: "水暖电工",
    highlight: "家装常用",
    sub: ["管件", "插座", "胶带", "灯泡"],
    cta: "去看看",
    wall: "linear-gradient(180deg, #edf3f2 0%, #d2dfdc 100%)",
    action: { kind: "category", match: /水暖|管件|电工|电料/, keyword: "管" },
    art: (
      <>
        {/* 插座面板装在墙上，管件和灯泡放在台面 */}
        <Art name="socket" className="absolute right-[10px] top-[-6px] h-[74px] w-[74px]" />
        <Art name="elbow" className="absolute bottom-[-4px] left-[14px] h-[70px] w-[70px]" />
        <Art name="bulb" className="absolute bottom-[-2px] right-[22px] h-[64px] w-[64px]" />
      </>
    ),
  },
  {
    key: "how",
    title: "三步订货",
    highlight: "无需注册",
    sub: ["选好就下单，", "店家电话确认"],
    subJoin: "",
    cta: "开始选货",
    wall: "linear-gradient(180deg, #f0f1f8 0%, #d9dcea 100%)",
    action: { kind: "list" },
    art: (
      <ol className="absolute bottom-[14px] right-[6px] w-[136px] space-y-1.5">
        {["选好商品", "提交订货单", "店家联系确认"].map((step, i) => (
          <li
            key={step}
            className="flex items-center gap-1.5 rounded-full bg-white/90 py-1 pl-1 pr-2.5 text-[12px] font-semibold text-ink shadow-[0_2px_6px_rgba(15,27,45,0.12)]"
          >
            <span className="bg-brand-gradient flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    ),
  },
];

export function BannerCarousel({ onAction }: { onAction: (action: BannerAction) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false); // 手指按住
  const [hidden, setHidden] = useState(false); // 页面切到后台
  const [reduced, setReduced] = useState(false); // 系统开启了「减少动态效果」
  const resumeTimer = useRef<number | undefined>(undefined);
  const settleTimer = useRef<number | undefined>(undefined);
  const count = slides.length;

  // 末尾多放一张第一页的副本：从最后一张往后滑到副本，再瞬间跳回真正的第一张，看起来是无缝循环。
  const rendered = [...slides, slides[0]];

  const goTo = useCallback((target: number, smooth = true) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: target * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    const raw = Math.round(el.scrollLeft / el.clientWidth);
    setIndex(raw % count);
    // 停在副本上时，等滚动停下来再跳回第一张。
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      if (Math.round(el.scrollLeft / el.clientWidth) >= count) goTo(0, false);
    }, 140);
  };

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setReduced(Boolean(media?.matches));
    const onMedia = (event: MediaQueryListEvent) => setReduced(event.matches);
    media?.addEventListener?.("change", onMedia);
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      media?.removeEventListener?.("change", onMedia);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(resumeTimer.current);
      window.clearTimeout(settleTimer.current);
    };
  }, []);

  // 自动播放：每次切换后重新计时，所以手动滑动后也会等满 4 秒再切。
  useEffect(() => {
    if (held || hidden || reduced) return;
    const timer = window.setTimeout(() => {
      const el = track.current;
      if (!el) return;
      const raw = Math.round(el.scrollLeft / el.clientWidth);
      goTo(raw + 1);
    }, AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [index, held, hidden, reduced, goTo]);

  const hold = () => {
    window.clearTimeout(resumeTimer.current);
    setHeld(true);
  };
  const release = () => {
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setHeld(false), RESUME_MS);
  };

  return (
    <section aria-roledescription="轮播" aria-label="店铺横幅" className="relative">
      <div
        ref={track}
        onScroll={onScroll}
        onTouchStart={hold}
        onTouchEnd={release}
        onTouchCancel={release}
        onMouseDown={hold}
        onMouseUp={release}
        onMouseLeave={() => held && release()}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-[20px] shadow-card"
      >
        {rendered.map((slide, i) => (
          <div
            key={`${slide.key}-${i}`}
            className="w-full shrink-0 snap-center snap-always"
            aria-hidden={i === count || i !== index ? true : undefined}
            aria-roledescription="幻灯片"
            aria-label={`第 ${(i % count) + 1} 张，共 ${count} 张`}
          >
            <SlideView slide={slide} onAction={onAction} focusable={i === index} />
          </div>
        ))}
      </div>

      {/* 指示点：在木纹台面上，当前页为长条 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center">
        <div className="pointer-events-auto flex items-center rounded-full bg-black/10 px-1">
          {slides.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              aria-label={`第 ${i + 1} 张`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => goTo(i)}
              className="flex h-5 items-center px-[3px]"
            >
              <span className={`block h-[5px] rounded-full transition-all duration-300 ${i === index ? "w-4 bg-white" : "w-[5px] bg-white/55"}`} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 背景里虚化的仓库货架，营造实景感。 */
const shelves = (
  <svg viewBox="0 0 240 130" className="h-full w-full" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
    <g fill="#7b8aa0">
      <rect x="20" y="0" width="6" height="130" />
      <rect x="120" y="0" width="6" height="130" />
      <rect x="220" y="0" width="6" height="130" />
      <rect x="10" y="38" width="230" height="5" />
      <rect x="10" y="82" width="230" height="5" />
    </g>
    <g>
      <rect x="32" y="12" width="34" height="26" fill="#c7a679" />
      <rect x="70" y="20" width="24" height="18" fill="#9fb0c7" />
      <rect x="98" y="8" width="18" height="30" fill="#b6c2d3" />
      <rect x="132" y="16" width="40" height="22" fill="#c9ab80" />
      <rect x="176" y="10" width="38" height="28" fill="#a9b8cc" />
      <rect x="30" y="56" width="44" height="26" fill="#b1bfd1" />
      <rect x="78" y="62" width="36" height="20" fill="#c4a274" />
      <rect x="130" y="52" width="26" height="30" fill="#9fb0c7" />
      <rect x="160" y="60" width="52" height="22" fill="#c9ab80" />
      <rect x="34" y="100" width="58" height="30" fill="#a9b8cc" />
      <rect x="134" y="96" width="44" height="34" fill="#c4a274" />
    </g>
  </svg>
);

function SlideView({ slide, onAction, focusable }: { slide: Slide; onAction: (a: BannerAction) => void; focusable: boolean }) {
  if (slide.image) {
    return (
      <button type="button" tabIndex={focusable ? 0 : -1} onClick={() => onAction(slide.action)} className="block h-[176px] w-full">
        <img src={slide.image} alt={`${slide.title}${slide.highlight}`} className="h-full w-full object-cover" />
      </button>
    );
  }

  return (
    // 整张横幅都可点；真正可聚焦的是按钮。
    <div className="relative h-[176px] cursor-pointer overflow-hidden" style={{ background: slide.wall }} onClick={() => onAction(slide.action)}>
      {/* 墙面：虚化货架 + 窗光 */}
      <div className="pointer-events-none absolute bottom-[30px] right-0 top-0 w-[72%] opacity-40" style={{ filter: "blur(2.5px)" }} aria-hidden="true">
        {shelves}
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(105deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.55) 38%, rgba(255,255,255,0) 62%)" }}
        aria-hidden="true"
      />
      {/* 木纹工作台 */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[34px]"
        style={{
          background:
            "repeating-linear-gradient(92deg, rgba(110,62,24,0.10) 0 2px, rgba(0,0,0,0) 2px 11px, rgba(110,62,24,0.06) 11px 12px, rgba(0,0,0,0) 12px 23px), linear-gradient(180deg, #e2c197 0%, #cfa271 35%, #b07a45 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55), 0 -6px 12px rgba(60,40,20,0.10)",
        }}
        aria-hidden="true"
      />

      <div className="pointer-events-none absolute bottom-[22px] right-1 h-[140px] w-[176px]" aria-hidden="true">
        {slide.art}
      </div>

      <div className="relative flex h-full flex-col justify-center pb-[34px] pl-5 pr-[184px] pt-1">
        <h2 className="text-[25px] font-black italic leading-[1.15] tracking-wide text-[#13306f]">
          {slide.title}
          <br />
          <span className="bg-gradient-to-r from-[#ff8a1f] to-[#f4511e] bg-clip-text pr-1 text-transparent">{slide.highlight}</span>
        </h2>
        <p className="mt-1 text-[12px] font-medium leading-snug text-[#3b4a66]">
          {slide.sub.map((part, i) => (
            // 连接符放在词组外面，后面跟一个可换行点（wbr）。
            <Fragment key={part}>
              {i > 0 && (
                <>
                  {slide.subJoin ?? " · "}
                  <wbr />
                </>
              )}
              <span className="whitespace-nowrap">{part}</span>
            </Fragment>
          ))}
        </p>
        <button
          type="button"
          tabIndex={focusable ? 0 : -1}
          onClick={(event) => {
            event.stopPropagation();
            onAction(slide.action);
          }}
          // 看到的按钮高 34px，点击区域向外扩到 44px。
          className="bg-accent-gradient relative mt-2 inline-flex h-[34px] w-fit items-center gap-0.5 rounded-full pl-4 pr-3 text-[14px] font-bold text-white shadow-accent after:absolute after:-inset-[5px] after:content-[''] active:scale-95"
        >
          {slide.cta}
          <ChevronRightIcon size={15} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}

/** 横幅下方的服务说明，一直可见。 */
export function ServiceStrip() {
  const points = [
    { icon: BadgeCheckIcon, text: "免注册下单" },
    { icon: PhoneIcon, text: "店家确认价格" },
    { icon: TruckIcon, text: "送货或自提" },
  ];
  return (
    <ul className="flex items-center justify-between rounded-2xl bg-surface px-3 py-2.5 shadow-card" aria-label="服务说明">
      {points.map(({ icon: Icon, text }, index) => (
        <li key={text} className="flex min-w-0 items-center gap-1 text-[13px] font-medium text-ink">
          {index > 0 && <span className="mr-2 h-3.5 w-px bg-line" aria-hidden="true" />}
          <Icon size={16} className="shrink-0 text-brand" />
          <span className="whitespace-nowrap">{text}</span>
        </li>
      ))}
    </ul>
  );
}
