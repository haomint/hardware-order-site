// 后台「轮播图」列表（#70，契约 #87）：最多 5 张，可显示 / 隐藏、调整顺序、修改、删除。
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/index.ts";
import type { AdminBanner, Category, maxBanners } from "../api/index.ts";
import { useAsync } from "../lib/useAsync.ts";
import { PhotoBanner } from "../components/BannerCarousel.tsx";
import { EmptyNotice, ErrorNotice, toast } from "../components/Feedback.tsx";
import { Badge, Button, ConfirmDialog, Switch } from "./ui.tsx";

/** 与契约 maxBanners 一致；契约改了数字，这里会类型报错。 */
export const BANNER_LIMIT: typeof maxBanners = 5;

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : "操作失败，请重试。");

export function Banners() {
  const loaded = useAsync(() => Promise.all([api.listAdminBanners(), api.listAdminCategories()]), []);
  const [items, setItems] = useState<AdminBanner[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<AdminBanner | null>(null);

  useEffect(() => {
    document.title = "轮播图 - 店铺后台";
  }, []);
  useEffect(() => {
    if (loaded.state.status !== "ready") return;
    setItems(loaded.state.data[0].items);
    setCategories(loaded.state.data[1].items);
  }, [loaded.state]);

  const reload = async () => setItems((await api.listAdminBanners()).items);

  // 调整顺序：按新顺序给每张写入 0、1、2…，只提交变化的那几张
  const move = async (index: number, delta: -1 | 1) => {
    if (!items || busy) return;
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    try {
      for (const [order, banner] of next.entries()) {
        if (banner.sortOrder !== order) await api.updateBanner(banner.id, { sortOrder: order });
      }
      await reload();
    } catch (error) {
      toast(messageOf(error));
      await reload().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (banner: AdminBanner, isVisible: boolean) => {
    setBusy(true);
    try {
      const updated = await api.updateBanner(banner.id, { isVisible });
      setItems((list) => list?.map((b) => (b.id === banner.id ? updated : b)) ?? null);
      toast(isVisible ? "已显示在首页" : "已隐藏");
    } catch (error) {
      toast(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteBanner(deleting.id);
      toast("已删除轮播图");
      setDeleting(null);
      await reload();
    } catch (error) {
      setDeleting(null);
      toast(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  if (loaded.state.status === "error") return <ErrorNotice message={loaded.state.error.message} onRetry={loaded.retry} />;
  if (!items) return <p className="py-10 text-center text-muted">正在加载…</p>;

  const full = items.length >= BANNER_LIMIT;
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "分类已不存在";
  const shownCount = items.filter((b) => b.isVisible && b.backgroundImageUrl).length;

  return (
    <div className="space-y-4 pb-6">
      <div>
        <h1 className="headline text-[22px] font-semibold text-ink">首页轮播图</h1>
        <p className="mt-0.5 text-[14px] leading-relaxed text-muted">
          最多 {BANNER_LIMIT} 张，打开「显示」的会在首页自动轮换。一张都不显示时，首页用内置的示例图。
        </p>
      </div>

      {full ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-[14px] text-muted">已经有 {BANNER_LIMIT} 张了，想加新的请先删除一张。</p>
      ) : (
        <Link
          to="/admin/banners/new"
          className="flex min-h-tap w-full items-center justify-center rounded-xl bg-brand text-base font-semibold text-white active:bg-brand-dark"
        >
          添加轮播图
        </Link>
      )}

      {items.length === 0 ? (
        <EmptyNotice title="还没有轮播图">添加后，首页顶部会轮换显示您上传的图片和文字。</EmptyNotice>
      ) : (
        <>
          <p className="text-[13px] text-muted">
            共 {items.length} 张，首页正在显示 {shownCount} 张
          </p>
          <ul className="space-y-4">
            {items.map((banner, index) => (
              <li key={banner.id} className="overflow-hidden rounded-card bg-surface">
                <div className={banner.isVisible ? "" : "opacity-50"}>
                  {banner.backgroundImageUrl ? (
                    <PhotoBanner photo={banner.backgroundImageUrl} title={banner.title} description={banner.description} buttonText={banner.buttonText} focusable={false} />
                  ) : (
                    <div className="flex h-[188px] items-center justify-center bg-page px-6 text-center text-[14px] text-muted">
                      背景图片已失效，请点「修改」换一张，或删除这张轮播图。
                    </div>
                  )}
                </div>
                <div className="space-y-1 px-4 pb-3 pt-2">
                  <div className="flex items-center gap-2 text-[13px] text-muted">
                    <span>第 {index + 1} 张</span>
                    <span>·</span>
                    <span className="min-w-0 truncate">点击进入「{categoryName(banner.categoryId)}」</span>
                    {!banner.isVisible && <Badge tone="gray">已隐藏</Badge>}
                  </div>
                  <Switch
                    label="在首页显示"
                    checked={banner.isVisible}
                    disabled={busy || (!banner.isVisible && !banner.backgroundImageUrl)}
                    onChange={(next) => toggle(banner, next)}
                  />
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button variant="outline" className="px-3" disabled={busy || index === 0} onClick={() => move(index, -1)}>
                      上移
                    </Button>
                    <Button variant="outline" className="px-3" disabled={busy || index === items.length - 1} onClick={() => move(index, 1)}>
                      下移
                    </Button>
                    <Link
                      to={`/admin/banners/${banner.id}`}
                      className="inline-flex min-h-tap items-center rounded-xl bg-page px-4 text-base text-ink active:opacity-70"
                    >
                      修改
                    </Link>
                    <Button variant="danger" className="ml-auto px-4" disabled={busy} onClick={() => setDeleting(banner)}>
                      删除
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="删除轮播图"
        message="删除后无法恢复。只是暂时不想展示的话，可以关闭「在首页显示」。"
        confirmText="删除"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
