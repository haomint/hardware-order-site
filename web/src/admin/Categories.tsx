import { useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "../api/index.ts";
import type { Category } from "../api/index.ts";
import { useAsync } from "../lib/useAsync.ts";
import { EmptyNotice, ErrorNotice, toast } from "../components/Feedback.tsx";
import { Button, Card, ConfirmDialog, Field, TextInput } from "./ui.tsx";

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.fieldErrors?.name ?? error.fieldErrors?.sortOrder ?? error.message;
  return "操作失败，请重试。";
}

/** 排序值输入框里的文字转成 0–9999 的整数；空白视为 0，非法返回 null。 */
function parseSort(text: string): number | null {
  if (text.trim() === "") return 0;
  if (!/^\d{1,4}$/.test(text.trim())) return null;
  return Number(text.trim());
}

export function Categories() {
  const { state, retry } = useAsync(() => api.listAdminCategories(), []);
  const [items, setItems] = useState<Category[] | null>(null);
  const list = items ?? (state.status === "ready" ? state.data.items : []);

  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const [deleting, setDeleting] = useState<Category | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // 新增或修改后重新取一次，保证顺序与服务端一致。
  const reload = async () => {
    try {
      setItems((await api.listAdminCategories()).items);
    } catch (error) {
      toast(messageOf(error));
    }
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") {
      setAddError("请填写分类名称。");
      return;
    }
    setAdding(true);
    setAddError("");
    try {
      // 新分类默认排在最后。
      const last = list.reduce((max, c) => Math.max(max, c.sortOrder), 0);
      await api.createCategory({ name: name.trim(), sortOrder: Math.min(last + 1, 9999) });
      setName("");
      toast("已添加分类");
      await reload();
    } catch (error) {
      setAddError(messageOf(error));
    } finally {
      setAdding(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.deleteCategory(deleting.id);
      toast("已删除分类");
      setDeleting(null);
      await reload();
    } catch (error) {
      setDeleting(null);
      toast(messageOf(error));
    } finally {
      setDeleteBusy(false);
    }
  };

  if (state.status === "error") return <ErrorNotice message={state.error.message} onRetry={retry} />;

  return (
    <div className="space-y-4">
      <Card title="添加分类">
        <form onSubmit={add} className="flex items-start gap-2" noValidate>
          <div className="min-w-0 flex-1">
            <Field label="分类名称" error={addError}>
              {(id, describedBy) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={Boolean(addError)}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：水暖管件"
                  maxLength={50}
                />
              )}
            </Field>
          </div>
          <Button type="submit" disabled={adding} className="mt-[30px] h-12 shrink-0">
            {adding ? "添加中…" : "添加"}
          </Button>
        </form>
      </Card>

      <Card title={`全部分类${list.length ? `（${list.length}）` : ""}`}>
        <p className="mb-2 text-sm text-muted">排序数字越小越靠前。没有上架商品的分类不会在商城显示。</p>
        {state.status === "loading" && items === null ? (
          <p className="py-6 text-center text-muted">正在加载…</p>
        ) : list.length === 0 ? (
          <EmptyNotice title="还没有分类">先在上方添加一个分类，再去添加商品。</EmptyNotice>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((category) => (
              <CategoryRow key={category.id} category={category} onSaved={reload} onDelete={() => setDeleting(category)} />
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        title="删除分类"
        message={
          <>
            确定删除「{deleting?.name}」吗？
            <br />
            分类下还有商品时无法删除，需要先把商品改到其他分类。
          </>
        }
        confirmText="删除"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function CategoryRow({ category, onSaved, onDelete }: { category: Category; onSaved: () => Promise<void>; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [sort, setSort] = useState(String(category.sortOrder));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const sortOrder = parseSort(sort);
    if (name.trim() === "") return setError("请填写分类名称。");
    if (sortOrder === null) return setError("排序请填 0 到 9999 的整数。");

    const patch: { name?: string; sortOrder?: number } = {};
    if (name.trim() !== category.name) patch.name = name.trim();
    if (sortOrder !== category.sortOrder) patch.sortOrder = sortOrder;
    if (Object.keys(patch).length === 0) return setEditing(false);

    setBusy(true);
    setError("");
    try {
      await api.updateCategory(category.id, patch);
      toast("已保存");
      setEditing(false);
      await onSaved();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <li className="flex items-center gap-2 py-2">
        <span className="tabular w-10 shrink-0 text-sm text-faint" title="排序">
          {category.sortOrder}
        </span>
        <span className="min-w-0 flex-1 break-words text-base text-ink">{category.name}</span>
        <Button variant="ghost" className="px-3" onClick={() => setEditing(true)}>
          修改
        </Button>
        <Button variant="ghost" className="px-3 text-red-700" onClick={onDelete}>
          删除
        </Button>
      </li>
    );
  }

  return (
    <li className="py-3">
      <form onSubmit={save} className="space-y-3" noValidate>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Field label="名称">
              {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoFocus />}
            </Field>
          </div>
          <div className="w-24 shrink-0">
            <Field label="排序">
              {(id) => (
                <TextInput id={id} inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} maxLength={4} />
              )}
            </Field>
          </div>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="flex-1">
            {busy ? "保存中…" : "保存"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => {
              setName(category.name);
              setSort(String(category.sortOrder));
              setError("");
              setEditing(false);
            }}
          >
            取消
          </Button>
        </div>
      </form>
    </li>
  );
}
