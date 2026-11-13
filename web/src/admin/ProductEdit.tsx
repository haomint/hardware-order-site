import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/index.ts";
import type { AdminImage, AdminProduct, Category, CreateProduct } from "../api/index.ts";
import { useAsync } from "../lib/useAsync.ts";
import { formatYuan } from "../lib/format.ts";
import { ImageError, prepareImage } from "../lib/image.ts";
import { ErrorNotice, toast } from "../components/Feedback.tsx";
import { BackIcon, CloseIcon, PlusIcon } from "../components/icons.tsx";
import { Button, Card, ConfirmDialog, Field, Switch, TextArea, TextInput } from "./ui.tsx";

const MAX_DETAIL_IMAGES = 5;

type Form = {
  name: string;
  brand: string;
  model: string;
  categoryId: string;
  negotiable: boolean;
  priceText: string;
  unit: string;
  specifications: string;
  isPublished: boolean;
  isOutOfStock: boolean;
  isPinned: boolean;
  sortText: string;
  mainImage: AdminImage | null;
  detailImages: AdminImage[];
};

type Errors = Partial<Record<keyof Form | "priceCents" | "sortOrder" | "mainImageId" | "detailImageIds", string>>;

function emptyForm(categoryId: string): Form {
  return {
    name: "",
    brand: "",
    model: "",
    categoryId,
    negotiable: false,
    priceText: "",
    unit: "",
    specifications: "",
    isPublished: true,
    isOutOfStock: false,
    isPinned: false,
    sortText: "0",
    mainImage: null,
    detailImages: [],
  };
}

function fromProduct(p: AdminProduct): Form {
  return {
    name: p.name,
    brand: p.brand,
    model: p.model,
    categoryId: p.categoryId,
    negotiable: p.priceCents === null,
    priceText: p.priceCents === null ? "" : formatYuan(p.priceCents).replace(/,/g, ""),
    unit: p.unit,
    specifications: p.specifications,
    isPublished: p.isPublished,
    isOutOfStock: p.isOutOfStock,
    isPinned: p.isPinned,
    sortText: String(p.sortOrder),
    mainImage: p.mainImage,
    detailImages: p.detailImages,
  };
}

/** 「12」「12.5」「12.50」转成分；格式不对返回 null。 */
function yuanToCents(text: string): number | null {
  const value = text.trim().replace(/[,，]/g, "");
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

function parseSort(text: string): number | null {
  if (text.trim() === "") return 0;
  return /^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : null;
}

/** 前端先检查一遍，减少来回；后端仍会完整校验。 */
function check(form: Form): { errors: Errors; payload?: CreateProduct } {
  const errors: Errors = {};
  if (form.name.trim() === "") errors.name = "请填写商品名。";
  if (form.categoryId === "") errors.categoryId = "请选择分类。";
  if (form.unit.trim() === "") errors.unit = "请填写计量单位，例如：个、盒、米。";
  if (form.specifications.trim() === "") errors.specifications = "请填写性能和参数说明。";

  const priceCents = form.negotiable ? null : yuanToCents(form.priceText);
  if (!form.negotiable && priceCents === null) {
    errors.priceText = form.priceText.trim() === "" ? "请填写参考价，或选择「价格面议」。" : "价格格式不对，例如 12 或 12.50。";
  }
  const sortOrder = parseSort(form.sortText);
  if (sortOrder === null) errors.sortText = "请填 0 到 9999 的整数。";
  if (form.isPublished && form.mainImage === null) errors.mainImage = "上架前请先添加主图，或先关闭「上架」保存。";

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    payload: {
      name: form.name.trim(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      categoryId: form.categoryId,
      priceCents,
      unit: form.unit.trim(),
      specifications: form.specifications.trim(),
      isPublished: form.isPublished,
      isOutOfStock: form.isOutOfStock,
      isPinned: form.isPinned,
      sortOrder: sortOrder ?? 0,
      mainImageId: form.mainImage?.id ?? null,
      detailImageIds: form.detailImages.map((image) => image.id),
    },
  };
}

/** 把后端返回的字段错误对应到表单项上。 */
function mapServerErrors(fieldErrors: Record<string, string>): Errors {
  const errors: Errors = {};
  for (const [path, message] of Object.entries(fieldErrors)) {
    const key = path.split(".")[0];
    if (key === "priceCents") errors.priceText = message;
    else if (key === "sortOrder") errors.sortText = message;
    else if (key === "mainImageId") errors.mainImage = message;
    else if (key === "detailImageIds") errors.detailImages = message;
    else errors[key as keyof Errors] = message;
  }
  return errors;
}

export function ProductEdit() {
  const { id } = useParams();
  const isNew = id === undefined;

  const categories = useAsync(() => api.listAdminCategories(), []);
  const product = useAsync<AdminProduct | null>(() => (isNew ? Promise.resolve(null) : api.getAdminProduct(id)), [id]);

  if (categories.state.status === "error") return <ErrorNotice message={categories.state.error.message} onRetry={categories.retry} />;
  if (product.state.status === "error") {
    const notFound = product.state.error instanceof ApiError && product.state.error.code === "PRODUCT_NOT_FOUND";
    return notFound ? (
      <div className="py-10 text-center">
        <p className="text-base text-ink">这件商品不存在，可能已被删除。</p>
        <Link to="/admin/products" className="mt-4 inline-flex min-h-tap items-center text-base text-brand">
          返回商品列表
        </Link>
      </div>
    ) : (
      <ErrorNotice message={product.state.error.message} onRetry={product.retry} />
    );
  }
  if (categories.state.status !== "ready" || product.state.status !== "ready") {
    return <p className="py-10 text-center text-muted">正在加载…</p>;
  }

  const list = categories.state.data.items;
  if (isNew && list.length === 0) {
    return (
      <Card>
        <p className="text-base text-ink">还没有分类，请先添加分类再新增商品。</p>
        <Link
          to="/admin/categories"
          className="mt-4 inline-flex min-h-tap items-center rounded-control bg-brand px-5 text-base font-medium text-white"
        >
          去添加分类
        </Link>
      </Card>
    );
  }

  return (
    <Editor
      key={id ?? "new"}
      productId={id}
      categories={list}
      // 新增时不预选分类，避免店主没注意就归错了类。
      initial={product.state.data ? fromProduct(product.state.data) : emptyForm("")}
    />
  );
}

function Editor({ productId, categories, initial }: { productId?: string; categories: Category[]; initial: Form }) {
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);

  // 有未保存的修改时，关闭或刷新页面前提醒。
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const goBack = () => {
    if (dirty && !window.confirm("修改还没有保存，确定离开吗？")) return;
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/admin/products");
  };

  const scrollToFirstError = () => {
    window.setTimeout(() => {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true'], [data-error='true']")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 0);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || uploading > 0) return;
    const { errors: found, payload } = check(form);
    if (!payload) {
      setErrors(found);
      toast("还有内容需要修改");
      scrollToFirstError();
      return;
    }
    setSaving(true);
    try {
      if (productId) await api.updateProduct(productId, payload);
      else await api.createProduct(payload);
      toast(productId ? "已保存" : "已新增商品");
      // 保存成功后不再提醒「未保存」。
      setForm(initial);
      navigate("/admin/products", { replace: !productId });
    } catch (caught) {
      setSaving(false);
      if (caught instanceof ApiError && caught.fieldErrors) {
        setErrors(mapServerErrors(caught.fieldErrors));
        scrollToFirstError();
      }
      toast(caught instanceof ApiError ? caught.message : "保存失败，请重试。");
    }
  };

  const remove = async () => {
    if (!productId) return;
    setDeleting(true);
    try {
      await api.deleteProduct(productId);
      toast("已删除商品");
      setForm(initial);
      navigate("/admin/products", { replace: true });
    } catch (caught) {
      setDeleting(false);
      setDeleteOpen(false);
      toast(caught instanceof ApiError ? caught.message : "删除失败，请重试。");
    }
  };

  /** 逐张压缩并上传。失败的图片给出提示，成功的照常加入。 */
  const upload = async (files: File[], target: "main" | "detail") => {
    const room = target === "main" ? 1 : MAX_DETAIL_IMAGES - form.detailImages.length;
    const picked = files.slice(0, Math.max(0, room));
    if (files.length > picked.length) toast(`详情图最多 ${MAX_DETAIL_IMAGES} 张，多出的已忽略`);
    if (picked.length === 0) return;

    setUploading((n) => n + picked.length);
    for (const file of picked) {
      try {
        const image = await api.uploadImage(await prepareImage(file));
        if (target === "main") set("mainImage", image);
        else
          setForm((previous) => ({
            ...previous,
            detailImages: [...previous.detailImages, image].slice(0, MAX_DETAIL_IMAGES),
          }));
        setErrors((previous) => ({ ...previous, mainImage: undefined, detailImages: undefined }));
      } catch (caught) {
        toast(caught instanceof ImageError || caught instanceof ApiError ? caught.message : "图片上传失败，请重试。");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const makeMain = (image: AdminImage) => {
    setForm((previous) => ({
      ...previous,
      mainImage: image,
      // 原来的主图放回详情图里，不丢失。
      detailImages: [
        ...(previous.mainImage ? [previous.mainImage] : []),
        ...previous.detailImages.filter((item) => item.id !== image.id),
      ].slice(0, MAX_DETAIL_IMAGES),
    }));
    setErrors((previous) => ({ ...previous, mainImage: undefined }));
  };

  return (
    <form ref={formRef} onSubmit={save} noValidate className="pb-24">
      <div className="mb-3 flex items-center gap-1">
        <button type="button" onClick={goBack} className="-ml-2 flex min-h-tap items-center gap-0.5 px-2 text-base text-ink">
          <BackIcon />
          返回
        </button>
        <h1 className="text-lg font-bold text-ink">{productId ? "编辑商品" : "新增商品"}</h1>
      </div>

      <div className="space-y-4">
        <Card title="图片">
          <div data-error={Boolean(errors.mainImage)}>
            <p className="mb-2 text-[15px] font-medium text-ink">主图</p>
            <div className="flex items-start gap-3">
              {form.mainImage ? (
                <ImageTile image={form.mainImage} large onRemove={() => set("mainImage", null)} />
              ) : (
                <UploadTile large label="添加主图" disabled={uploading > 0} onFiles={(files) => upload(files, "main")} />
              )}
              <div className="min-w-0 text-sm text-muted">
                <p>商品列表和详情页的第一张图。白底、主体居中效果最好。</p>
                {form.mainImage && (
                  <UploadLink disabled={uploading > 0} onFiles={(files) => upload(files, "main")}>
                    更换主图
                  </UploadLink>
                )}
              </div>
            </div>
            {errors.mainImage && <p className="mt-2 text-sm text-red-700">{errors.mainImage}</p>}
          </div>

          <div className="mt-5" data-error={Boolean(errors.detailImages)}>
            <p className="mb-2 text-[15px] font-medium text-ink">
              详情图
              <span className="ml-1 text-sm font-normal text-faint">
                （可不填，{form.detailImages.length}/{MAX_DETAIL_IMAGES}）
              </span>
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {form.detailImages.map((image) => (
                <ImageTile
                  key={image.id}
                  image={image}
                  onRemove={() =>
                    set(
                      "detailImages",
                      form.detailImages.filter((item) => item.id !== image.id),
                    )
                  }
                  onMakeMain={() => makeMain(image)}
                />
              ))}
              {form.detailImages.length < MAX_DETAIL_IMAGES && (
                <UploadTile multiple label="添加" disabled={uploading > 0} onFiles={(files) => upload(files, "detail")} />
              )}
            </div>
            {errors.detailImages && <p className="mt-2 text-sm text-red-700">{errors.detailImages}</p>}
          </div>
          {uploading > 0 && (
            <p className="mt-3 text-sm text-brand" aria-live="polite">
              正在上传 {uploading} 张图片…
            </p>
          )}
        </Card>

        <Card title="基本信息">
          <div className="space-y-4">
            <Field label="商品名" error={errors.name}>
              {(id, d) => (
                <TextInput
                  id={id}
                  aria-describedby={d}
                  invalid={Boolean(errors.name)}
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="例如：冲击钻 家用多功能手电钻"
                  maxLength={100}
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="品牌" optional error={errors.brand}>
                {(id, d) => (
                  <TextInput id={id} aria-describedby={d} value={form.brand} onChange={(e) => set("brand", e.target.value)} maxLength={60} />
                )}
              </Field>
              <Field label="型号" optional error={errors.model}>
                {(id, d) => (
                  <TextInput id={id} aria-describedby={d} value={form.model} onChange={(e) => set("model", e.target.value)} maxLength={100} />
                )}
              </Field>
            </div>
            <Field label="分类" error={errors.categoryId}>
              {(id, d) => (
                <select
                  id={id}
                  aria-describedby={d}
                  aria-invalid={Boolean(errors.categoryId) || undefined}
                  value={form.categoryId}
                  onChange={(e) => set("categoryId", e.target.value)}
                  className={`h-12 w-full rounded-control border bg-surface px-3 text-base focus:outline-none ${
                    errors.categoryId ? "border-red-400 focus:border-red-600" : "border-line focus:border-brand"
                  } ${form.categoryId === "" ? "text-faint" : "text-ink"}`}
                >
                  <option value="" disabled>
                    请选择分类
                  </option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </Card>

        <Card title="价格">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="价格方式">
              {[
                { value: false, label: "填写参考价" },
                { value: true, label: "价格面议" },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={form.negotiable === option.value}
                  onClick={() => {
                    set("negotiable", option.value);
                    setErrors((previous) => ({ ...previous, priceText: undefined }));
                  }}
                  className={`min-h-tap rounded-control border text-base font-medium ${
                    form.negotiable === option.value ? "border-brand bg-brand-soft text-brand" : "border-line text-ink"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <Field
                label="参考单价（元）"
                error={errors.priceText}
                hint={form.negotiable ? "面议商品在商城不显示价格。" : undefined}
              >
                {(id, d) => (
                  <TextInput
                    id={id}
                    aria-describedby={d}
                    invalid={Boolean(errors.priceText)}
                    inputMode="decimal"
                    disabled={form.negotiable}
                    value={form.negotiable ? "" : form.priceText}
                    onChange={(e) => set("priceText", e.target.value)}
                    placeholder={form.negotiable ? "面议" : "例如 12.50"}
                    maxLength={12}
                  />
                )}
              </Field>
              <Field label="单位" error={errors.unit}>
                {(id, d) => (
                  <TextInput
                    id={id}
                    aria-describedby={d}
                    invalid={Boolean(errors.unit)}
                    value={form.unit}
                    onChange={(e) => set("unit", e.target.value)}
                    placeholder="个"
                    maxLength={20}
                  />
                )}
              </Field>
            </div>
          </div>
        </Card>

        <Card title="性能参数">
          <Field label="参数说明" error={errors.specifications} hint="每项一行，例如「额定功率：570 W」。">
            {(id, d) => (
              <TextArea
                id={id}
                aria-describedby={d}
                invalid={Boolean(errors.specifications)}
                rows={6}
                value={form.specifications}
                onChange={(e) => set("specifications", e.target.value)}
                maxLength={3000}
              />
            )}
          </Field>
        </Card>

        <Card title="显示设置">
          <div className="divide-y divide-line">
            <Switch
              checked={form.isPublished}
              onChange={(value) => {
                set("isPublished", value);
                setErrors((previous) => ({ ...previous, mainImage: undefined }));
              }}
              label="上架"
              hint="关闭后商城里看不到这件商品"
            />
            <Switch
              checked={form.isOutOfStock}
              onChange={(value) => set("isOutOfStock", value)}
              label="暂时缺货"
              hint="商城里仍能看到，但不能加入购物车"
            />
            <Switch
              checked={form.isPinned}
              onChange={(value) => set("isPinned", value)}
              label="置顶"
              hint="排在所有普通商品前面"
            />
          </div>
          <div className="mt-3 w-32">
            <Field label="排序" error={errors.sortText}>
              {(id, d) => (
                <TextInput
                  id={id}
                  aria-describedby={d}
                  invalid={Boolean(errors.sortText)}
                  inputMode="numeric"
                  value={form.sortText}
                  onChange={(e) => set("sortText", e.target.value)}
                  maxLength={4}
                />
              )}
            </Field>
          </div>
          <p className="mt-1.5 text-sm text-muted">数字越小越靠前。都填 0 时，新加的商品排在前面。</p>
        </Card>

        {productId && (
          <Card>
            <p className="text-base font-medium text-ink">删除商品</p>
            <p className="mt-1 text-sm text-muted">删除后无法恢复。暂时不卖的商品建议关闭「上架」，以后还能再上架。</p>
            <Button variant="danger" className="mt-3 w-full" onClick={() => setDeleteOpen(true)}>
              删除这件商品
            </Button>
          </Card>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface shadow-bar">
        <div className="pb-safe mx-auto max-w-shell">
          <div className="flex gap-3 px-4 py-3">
            <Button variant="outline" onClick={goBack} className="h-12 w-28 shrink-0">
              取消
            </Button>
            <Button type="submit" disabled={saving || uploading > 0} className="h-12 flex-1 text-lg">
              {saving ? "保存中…" : uploading > 0 ? "图片上传中…" : "保存"}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="删除商品"
        message={
          <>
            确定删除「{initial.name}」吗？删除后无法恢复。
            <br />
            已经提交的订单不受影响。
          </>
        }
        confirmText="确定删除"
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setDeleteOpen(false)}
      />
    </form>
  );
}

function ImageTile({
  image,
  large,
  onRemove,
  onMakeMain,
}: {
  image: AdminImage;
  large?: boolean;
  onRemove: () => void;
  onMakeMain?: () => void;
}) {
  return (
    <div className={`relative shrink-0 ${large ? "h-28 w-28" : "aspect-square w-full"}`}>
      <img src={image.thumbnailUrl} alt="" className="h-full w-full rounded-md border border-line bg-white object-contain" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="移除这张图片"
        className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink/75 text-white"
      >
        <CloseIcon size={16} />
      </button>
      {onMakeMain && (
        <button
          type="button"
          onClick={onMakeMain}
          className="absolute inset-x-0 bottom-0 rounded-b-md bg-ink/60 py-1 text-xs text-white"
        >
          设为主图
        </button>
      )}
    </div>
  );
}

function UploadTile({
  label,
  large,
  multiple,
  disabled,
  onFiles,
}: {
  label: string;
  large?: boolean;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  return (
    <label
      className={`flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-line text-sm text-muted active:bg-brand-soft ${
        large ? "h-28 w-28" : "aspect-square w-full"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <PlusIcon size={24} />
      {label}
      <FileInput multiple={multiple} disabled={disabled} onFiles={onFiles} />
    </label>
  );
}

function UploadLink({ children, disabled, onFiles }: { children: string; disabled?: boolean; onFiles: (files: File[]) => void }) {
  return (
    <label className={`mt-2 inline-flex min-h-tap cursor-pointer items-center text-[15px] font-medium text-brand ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      {children}
      <FileInput disabled={disabled} onFiles={onFiles} />
    </label>
  );
}

function FileInput({ multiple, disabled, onFiles }: { multiple?: boolean; disabled?: boolean; onFiles: (files: File[]) => void }) {
  return (
    <input
      type="file"
      // 用 image/* 让手机弹出「拍照 / 相册」选择；格式转换在上传前完成。
      accept="image/*"
      multiple={multiple}
      disabled={disabled}
      className="sr-only"
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        // 清空选择，下次选同一张图也能触发。
        event.target.value = "";
        if (files.length > 0) onFiles(files);
      }}
    />
  );
}
