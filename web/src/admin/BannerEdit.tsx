// 后台「新增 / 修改轮播图」（#70，契约 #87）：背景图、标题、说明、按钮文字、点击进入的分类、是否显示，上方实时预览。
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/index.ts";
import type { AdminBanner, BannerPatch, Category, bannerTextLimits } from "../api/index.ts";
import { useAsync } from "../lib/useAsync.ts";
import { ImageError, prepareImage } from "../lib/image.ts";
import { PhotoBanner } from "../components/BannerCarousel.tsx";
import { ErrorNotice, toast } from "../components/Feedback.tsx";
import { BackIcon } from "../components/icons.tsx";
import { Button, Card, Field, Switch, TextInput } from "./ui.tsx";
import { BANNER_LIMIT } from "./Banners.tsx";

/** 与契约 bannerTextLimits 一致；契约改了数字，这里会类型报错。 */
const LIMIT: typeof bannerTextLimits = { title: 16, description: 30, buttonText: 6 };

type Form = {
  title: string;
  description: string;
  buttonText: string;
  categoryId: string;
  isVisible: boolean;
  image: { id: string; url: string } | null;
};
type Key = "title" | "description" | "buttonText" | "categoryId" | "image";
type Errors = Partial<Record<Key, string>>;

const emptyForm: Form = { title: "", description: "", buttonText: "去看看", categoryId: "", isVisible: true, image: null };

function formOf(banner: AdminBanner): Form {
  return {
    title: banner.title,
    description: banner.description,
    buttonText: banner.buttonText,
    categoryId: banner.categoryId,
    isVisible: banner.isVisible,
    image: banner.backgroundImageUrl ? { id: banner.backgroundImageId, url: banner.backgroundImageUrl } : null,
  };
}

function check(form: Form): Errors {
  const errors: Errors = {};
  if (!form.image) errors.image = "请上传一张背景图片。";
  if (form.title.trim().length > LIMIT.title) errors.title = `标题不能超过 ${LIMIT.title} 个字。`;
  if (form.description.trim().length > LIMIT.description) errors.description = `说明不能超过 ${LIMIT.description} 个字。`;
  if (!form.buttonText.trim()) errors.buttonText = "请填写按钮文字。";
  else if (form.buttonText.trim().length > LIMIT.buttonText) errors.buttonText = `按钮文字不能超过 ${LIMIT.buttonText} 个字。`;
  if (!form.categoryId) errors.categoryId = "请选择点击后进入的分类。";
  return errors;
}

export function BannerEdit() {
  const { id } = useParams();
  const loaded = useAsync(() => Promise.all([api.listAdminBanners(), api.listAdminCategories()]), []);

  if (loaded.state.status === "error") return <ErrorNotice message={loaded.state.error.message} onRetry={loaded.retry} />;
  if (loaded.state.status !== "ready") return <p className="py-10 text-center text-muted">正在加载…</p>;

  const [banners, categories] = loaded.state.data;
  const current = id ? banners.items.find((b) => b.id === id) : undefined;
  if (id && !current) {
    return (
      <div className="py-10 text-center">
        <p className="text-base text-ink">找不到这张轮播图，可能已经删除。</p>
        <Link to="/admin/banners" className="mt-4 inline-flex min-h-tap items-center text-base text-brand">
          返回轮播图列表
        </Link>
      </div>
    );
  }
  if (!id && banners.items.length >= BANNER_LIMIT) {
    return (
      <div className="py-10 text-center">
        <p className="text-base text-ink">已经有 {BANNER_LIMIT} 张轮播图了，请先删除一张再添加。</p>
        <Link to="/admin/banners" className="mt-4 inline-flex min-h-tap items-center text-base text-brand">
          返回轮播图列表
        </Link>
      </div>
    );
  }
  const nextOrder = banners.items.reduce((max, b) => Math.max(max, b.sortOrder + 1), 0);
  return <Editor current={current} categories={categories.items} nextOrder={Math.min(nextOrder, 9999)} />;
}

function Editor({ current, categories, nextOrder }: { current?: AdminBanner; categories: Category[]; nextOrder: number }) {
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(current ? formOf(current) : emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = `${current ? "修改" : "添加"}轮播图 - 店铺后台`;
  }, [current]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setErrors((previous) => ({ ...previous, image: undefined }));
    try {
      const uploaded = await api.uploadImage(await prepareImage(file));
      set("image", { id: uploaded.id, url: uploaded.imageUrl });
    } catch (error) {
      setErrors((previous) => ({
        ...previous,
        image: error instanceof ImageError || error instanceof ApiError ? error.message : "上传失败，请重试。",
      }));
    } finally {
      setUploading(false);
    }
  };

  const goBack = () => navigate("/admin/banners");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || uploading) return;
    const found = check(form);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    const values = {
      title: form.title.trim(),
      description: form.description.trim(),
      buttonText: form.buttonText.trim(),
      categoryId: form.categoryId,
      isVisible: form.isVisible,
      backgroundImageId: form.image!.id,
    };
    setSaving(true);
    try {
      if (current) {
        const patch: BannerPatch = {};
        if (values.title !== current.title) patch.title = values.title;
        if (values.description !== current.description) patch.description = values.description;
        if (values.buttonText !== current.buttonText) patch.buttonText = values.buttonText;
        if (values.categoryId !== current.categoryId) patch.categoryId = values.categoryId;
        if (values.isVisible !== current.isVisible) patch.isVisible = values.isVisible;
        if (values.backgroundImageId !== current.backgroundImageId || !current.backgroundImageUrl) patch.backgroundImageId = values.backgroundImageId;
        if (Object.keys(patch).length > 0) await api.updateBanner(current.id, patch);
      } else {
        await api.createBanner({ ...values, sortOrder: nextOrder });
      }
      toast(current ? "已保存" : "已添加轮播图");
      goBack();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        const fe = error.fieldErrors;
        setErrors({ title: fe.title, description: fe.description, buttonText: fe.buttonText, categoryId: fe.categoryId, image: fe.backgroundImageId });
      }
      toast(error instanceof ApiError ? error.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  };

  const count = (key: "title" | "description" | "buttonText") => `${form[key].trim().length}/${LIMIT[key]}`;

  return (
    <form onSubmit={submit} noValidate className="space-y-4 pb-6">
      <div className="flex items-center gap-1">
        <button type="button" onClick={goBack} className="-ml-2 flex min-h-tap items-center gap-0.5 px-2 text-base text-ink">
          <BackIcon />
          轮播图
        </button>
        <h1 className="headline ml-1 text-[22px] font-semibold text-ink">{current ? "修改轮播图" : "添加轮播图"}</h1>
      </div>

      {/* 实时预览：和首页上看到的一样 */}
      <section>
        <p className="mb-1.5 px-1 text-[14px] text-muted">首页上的样子</p>
        <div className="overflow-hidden rounded-[22px]">
          {form.image ? (
            <PhotoBanner photo={form.image.url} title={form.title.trim()} description={form.description.trim()} buttonText={form.buttonText.trim() || "去看看"} focusable={false} />
          ) : (
            <div className="flex h-[188px] items-center justify-center bg-surface px-6 text-center text-[14px] text-muted">上传背景图片后，这里显示预览</div>
          )}
        </div>
      </section>

      <Card title="背景图片">
        <div className="flex flex-wrap items-center gap-3">
          <label className={`inline-flex min-h-tap cursor-pointer items-center rounded-xl bg-page px-4 text-base text-ink active:opacity-70 ${uploading || saving ? "pointer-events-none opacity-60" : ""}`}>
            {uploading ? "正在上传…" : form.image ? "换一张" : "上传图片"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading || saving}
              onChange={(event) => {
                void pickImage(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        {errors.image ? (
          <p className="mt-1.5 text-sm text-red-700">{errors.image}</p>
        ) : (
          <p className="mt-1.5 text-sm text-muted">建议横图，比例约 2:1（如 1600 × 800）。图片会居中裁剪铺满，重要内容放中间偏右，左边留给文字。</p>
        )}
      </Card>

      <Card title="文字">
        <div className="space-y-4">
          <Field label="标题" optional error={errors.title} hint={<CountHint text="手机上最多两行" count={count("title")} />}>
            {(fieldId, describedBy) => (
              <TextInput
                id={fieldId}
                aria-describedby={describedBy}
                invalid={Boolean(errors.title)}
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
                maxLength={LIMIT.title}
                placeholder="例如：电动工具 新品到店"
              />
            )}
          </Field>
          <Field label="一句说明" optional error={errors.description} hint={<CountHint text="写在标题下面的小字" count={count("description")} />}>
            {(fieldId, describedBy) => (
              <TextInput
                id={fieldId}
                aria-describedby={describedBy}
                invalid={Boolean(errors.description)}
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                maxLength={LIMIT.description}
                placeholder="例如：电钻、角磨机、电批 现货供应"
              />
            )}
          </Field>
          <Field label="按钮文字" error={errors.buttonText} hint={<CountHint text="蓝色文字链接" count={count("buttonText")} />}>
            {(fieldId, describedBy) => (
              <TextInput
                id={fieldId}
                aria-describedby={describedBy}
                invalid={Boolean(errors.buttonText)}
                value={form.buttonText}
                onChange={(event) => set("buttonText", event.target.value)}
                maxLength={LIMIT.buttonText}
                placeholder="去看看"
              />
            )}
          </Field>
        </div>
      </Card>

      <Card title="点击后">
        <Field label="进入的分类" error={errors.categoryId}>
          {(fieldId, describedBy) => (
            <select
              id={fieldId}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.categoryId) || undefined}
              value={form.categoryId}
              onChange={(event) => set("categoryId", event.target.value)}
              className={`h-12 w-full rounded-xl border bg-page px-3.5 text-base focus:outline-none ${
                errors.categoryId ? "border-red-400 focus:border-red-600" : "border-transparent focus:border-brand"
              } ${form.categoryId === "" ? "text-faint" : "text-ink"}`}
            >
              <option value="">请选择分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <p className="mt-1.5 text-sm text-muted">分类下没有上架商品时，这张轮播图暂时不会在首页显示。</p>
        <div className="mt-3 border-t border-line pt-1">
          <Switch label="在首页显示" checked={form.isVisible} onChange={(next) => set("isVisible", next)} />
        </div>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={saving || uploading}>
          {saving ? "正在保存…" : current ? "保存" : "添加"}
        </Button>
        <Button variant="outline" className="flex-1" disabled={saving} onClick={goBack}>
          取消
        </Button>
      </div>
    </form>
  );
}

function CountHint({ text, count }: { text: string; count: string }) {
  return (
    <span className="flex justify-between gap-3">
      <span>{text}</span>
      <span className="tabular shrink-0 text-faint">{count}</span>
    </span>
  );
}
