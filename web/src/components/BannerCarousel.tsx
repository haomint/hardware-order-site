import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/index.ts";
import type { Banner } from "../api/index.ts";
import type { ReactNode } from "react";
import { Art } from "./Art.tsx";
import { ChevronRightIcon } from "./icons.tsx";

/** 点击横幅后要做的事：滚动到商品列表，或进入某个分类（找不到分类时按关键词搜索）。 */
export type BannerAction =
  | { kind: "list" }
  | { kind: "category"; match: RegExp; keyword: string }
  /** 后台设置的轮播图：直接进入指定分类 */
  | { kind: "categoryId"; id: string };

type Slide = {
  key: string;
  title: string;
  highlight: string;
  /** 副标题的词组。窄屏放不下时只在词组之间换行，不会把一个词拆开。 */
  sub: string[];
  /** 词组之间的连接符，默认「 · 」。 */
  subJoin?: string;
  cta: string;
  action: BannerAction;
  /** 右侧的商品插图，坐标相对右侧 176×140 的区域，底边是地面。 */
  art: ReactNode;
  /**
   * 以后换成店主自己的横幅照片时填这里（放在 web/public/banners/ 下），
   * 有图片时只显示图片，文字和插图不再显示。
   */
  image?: string;
  /** 后台设置的轮播图：背景照片，文字由页面排在照片上（#70）。 */
  photo?: string;
};

/** 后台设置的轮播图转成幻灯片。 */
function fromBanner(banner: Banner): Slide {
  return {
    key: banner.id,
    title: banner.title,
    highlight: "",
    sub: banner.description ? [banner.description] : [],
    subJoin: "",
    cta: banner.buttonText,
    action: { kind: "categoryId", id: banner.categoryId },
    art: null,
    photo: banner.backgroundImageUrl,
  };
}

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
    action: { kind: "list" },
    art: (
      <ol className="absolute bottom-[14px] right-[6px] w-[136px] space-y-1.5">
        {["选好商品", "提交订货单", "店家联系确认"].map((step, i) => (
          <li
            key={step}
            className="flex items-center gap-1.5 rounded-full bg-white py-1 pl-1 pr-2.5 text-[12px] font-medium text-ink"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">
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
  // 有后台设置且能正常展示的轮播图就用它们；没有（或接口失败）时用内置示例图。
  const [custom, setCustom] = useState<Slide[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.listBanners().then(
      (result) => !cancelled && setCustom(result.items.map(fromBanner)),
      () => !cancelled && setCustom([]),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const list = custom && custom.length > 0 ? custom : slides;
  const count = list.length;

  // 末尾多放一张第一页的副本：从最后一张往后滑到副本，再瞬间跳回真正的第一张，看起来是无缝循环。
  const rendered = count > 1 ? [...list, list[0]] : list;

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
  // 换成后台轮播图后回到第一张
  useEffect(() => {
    goTo(0, false);
    setIndex(0);
  }, [list, goTo]);

  // 加载中显示的是灰色占位、还没有可滑动的轨道：等加载完再开始计时，否则这次计时落空、之后不会再排（#98 审查）。
  const ready = custom !== null;
  useEffect(() => {
    if (!ready || held || hidden || reduced || count < 2) return;
    const timer = window.setTimeout(() => {
      const el = track.current;
      if (!el) return;
      const raw = Math.round(el.scrollLeft / el.clientWidth);
      goTo(raw + 1);
    }, AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [ready, index, held, hidden, reduced, goTo, count]);

  const hold = () => {
    window.clearTimeout(resumeTimer.current);
    setHeld(true);
  };
  const release = () => {
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setHeld(false), RESUME_MS);
  };

  // 还没问到后台有没有设置轮播图：先放一块同样大小的灰底，避免先闪一下内置示例图再换成店主的图。
  // 下面留出指示点的高度，多张时加载完不跳动。
  if (custom === null) {
    return (
      <section aria-label="店铺横幅" aria-busy="true">
        <div className="h-[188px] rounded-[22px] bg-page" />
        <div className="mt-1.5 h-6" />
      </section>
    );
  }

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
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-[22px]"
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

      {/* 指示点：卡片下方的灰色小点，当前页颜色更深；只有一张时不显示，也不占位置（#97） */}
      {count > 1 && (
      <div className="mt-1.5 flex justify-center">
        <div className="flex items-center">
          {list.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              aria-label={`第 ${i + 1} 张`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => goTo(i)}
              className="flex h-6 items-center px-[4px]"
            >
              <span className={`block h-[7px] w-[7px] rounded-full transition-colors duration-300 ${i === index ? "bg-ink/70" : "bg-ink/20"}`} />
            </button>
          ))}
        </div>
      </div>
      )}
    </section>
  );
}

/**
 * 后台设置的轮播图：照片铺满卡片（居中裁剪），左侧一层白色渐变保证文字清楚。
 * 后台编辑页的预览也用这个，保证看到的和首页一样。
 */
export function PhotoBanner({
  photo,
  title,
  description,
  buttonText,
  onClick,
  focusable = true,
}: {
  photo: string | null;
  title: string;
  description: string;
  buttonText: string;
  onClick?: () => void;
  focusable?: boolean;
}) {
  return (
    <div className={`relative h-[188px] overflow-hidden bg-page ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
      {photo && <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.8) 42%, rgba(255,255,255,0) 72%)" }}
        aria-hidden="true"
      />
      <div className="relative flex h-full flex-col justify-center pl-6 pr-[38%]">
        {title && <h2 className="headline line-clamp-2 break-words text-[24px] font-semibold leading-[1.2] text-ink">{title}</h2>}
        {description && <p className="mt-1.5 line-clamp-2 break-words text-[13px] leading-snug text-ink/70">{description}</p>}
        <button
          type="button"
          tabIndex={focusable ? 0 : -1}
          onClick={(event) => {
            event.stopPropagation();
            onClick?.();
          }}
          className="relative mt-2.5 inline-flex w-fit items-center gap-0.5 whitespace-nowrap text-[15px] font-medium text-brand after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] active:opacity-60"
        >
          {buttonText}
          <ChevronRightIcon size={15} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

function SlideView({ slide, onAction, focusable }: { slide: Slide; onAction: (a: BannerAction) => void; focusable: boolean }) {
  if (slide.photo !== undefined) {
    return (
      <PhotoBanner
        photo={slide.photo}
        title={slide.title}
        description={slide.sub.join("")}
        buttonText={slide.cta}
        onClick={() => onAction(slide.action)}
        focusable={focusable}
      />
    );
  }
  if (slide.image) {
    return (
      <button type="button" tabIndex={focusable ? 0 : -1} onClick={() => onAction(slide.action)} className="block h-[188px] w-full">
        <img src={slide.image} alt={`${slide.title}${slide.highlight}`} className="h-full w-full object-cover" />
      </button>
    );
  }

  return (
    // 整张横幅都可点；真正可聚焦的是按钮。苹果风格：浅灰底、大字标题、蓝色文字链接，不用渐变和阴影。
    <div className="relative h-[188px] cursor-pointer overflow-hidden bg-page" onClick={() => onAction(slide.action)}>
      <div className="pointer-events-none absolute bottom-[14px] right-2 h-[140px] w-[176px]" aria-hidden="true">
        {slide.art}
      </div>

      <div className="relative flex h-full flex-col justify-center pl-6 pr-[176px]">
        <h2 className="headline text-[24px] font-semibold leading-[1.2] text-ink">
          {slide.title}
          <br />
          <span className="text-muted">{slide.highlight}</span>
        </h2>
        <p className="mt-1.5 text-[13px] leading-snug text-muted">
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
          // 文字链接样式，点击区域扩到 44px 高。
          className="relative mt-2.5 inline-flex w-fit items-center gap-0.5 text-[15px] font-medium text-brand after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] active:opacity-60"
        >
          {slide.cta}
          <ChevronRightIcon size={15} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
