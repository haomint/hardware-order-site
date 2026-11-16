// 后台「店铺资料」：店名、联系电话、客服微信引导文案（契约 #71，店主决定见 #6）。
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "../api/index.ts";
import type { Shop, ShopPatch } from "../api/index.ts";
import { useAsync } from "../lib/useAsync.ts";
import { useSetShop } from "../lib/shop.tsx";
import { ErrorNotice, toast } from "../components/Feedback.tsx";
import { Button, Card, Field, TextArea, TextInput } from "./ui.tsx";

type Key = keyof Shop;
type Errors = Partial<Record<Key, string>>;

const LIMIT: Record<Key, number> = { name: 100, phone: 50, wechatContactText: 300 };

/**
 * 与契约一致的检查，提交前就近提示；以后端结果为准。
 * 只检查这次要提交的项：原有资料里的电话即使含有现在不允许的字符，只改店名也能保存。
 */
function check(values: Shop, keys: Key[]): Errors {
  const errors: Errors = {};
  const only = (key: Key) => keys.includes(key);
  const name = values.name.trim();
  if (only("name") && !name) errors.name = "请填写店名。";
  else if (only("name") && name.length > LIMIT.name) errors.name = `店名不能超过 ${LIMIT.name} 个字。`;
  const phone = values.phone.trim();
  if (!only("phone")) {
    // 电话这次没改，不检查
  } else if (phone.length > LIMIT.phone) errors.phone = `联系电话不能超过 ${LIMIT.phone} 个字。`;
  else if (!/^[0-9+() -]*$/.test(phone)) errors.phone = "联系电话只能填写数字、空格、加号、减号和圆括号。";
  if (only("wechatContactText") && values.wechatContactText.trim().length > LIMIT.wechatContactText) {
    errors.wechatContactText = `微信引导文字不能超过 ${LIMIT.wechatContactText} 个字。`;
  }
  return errors;
}

export function ShopSettings() {
  const { state, retry } = useAsync(() => api.getAdminShop(), []);

  useEffect(() => {
    document.title = "店铺资料 - 店铺后台";
  }, []);

  if (state.status === "error") return <ErrorNotice message={state.error.message} onRetry={retry} />;
  if (state.status !== "ready") return <p className="py-10 text-center text-muted">正在加载…</p>;
  return <ShopForm initial={state.data} />;
}

function ShopForm({ initial }: { initial: Shop }) {
  const setShop = useSetShop();
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const patch: ShopPatch = {};
  (Object.keys(LIMIT) as Key[]).forEach((key) => {
    if (values[key].trim() !== saved[key]) patch[key] = values[key].trim();
  });
  const changed = Object.keys(patch).length > 0;

  const set = (key: Key) => (value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!changed || saving) return;
    const found = check(values, Object.keys(patch) as Key[]);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setSaving(true);
    try {
      const updated = await api.updateAdminShop(patch);
      setSaved(updated);
      setValues(updated);
      setShop(updated);
      toast("已保存，商城已显示新资料");
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        const fe = error.fieldErrors;
        setErrors({ name: fe.name, phone: fe.phone, wechatContactText: fe.wechatContactText });
      }
      toast(error instanceof ApiError ? error.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  };

  const count = (key: Key) => `${values[key].trim().length}/${LIMIT[key]}`;

  return (
    <form onSubmit={submit} noValidate className="space-y-3 pb-6">
      <div>
        <h1 className="headline text-[22px] font-semibold text-ink">店铺资料</h1>
        <p className="mt-0.5 text-[14px] text-muted">显示在商城首页、「联系店铺」弹窗和下单成功页，保存后马上生效。</p>
      </div>

      <Card>
        {/* 保存期间不能继续编辑，免得保存结果回来时把后改的内容盖掉 */}
        <fieldset disabled={saving} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <Field label="店名" error={errors.name}>
            {(id, describedBy) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                value={values.name}
                invalid={Boolean(errors.name)}
                onChange={(event) => set("name")(event.target.value)}
                maxLength={LIMIT.name}
                placeholder="例如：威马五金"
              />
            )}
          </Field>

          <Field
            label="联系电话"
            optional
            error={errors.phone}
            hint="客户点「拨打」时打这个号码，可以带区号，例如 0512-6812 3456。"
          >
            {(id, describedBy) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                type="tel"
                inputMode="tel"
                value={values.phone}
                invalid={Boolean(errors.phone)}
                onChange={(event) => set("phone")(event.target.value)}
                maxLength={LIMIT.phone}
                placeholder="例如：13800000000"
              />
            )}
          </Field>

          <Field
            label="微信引导文字"
            optional
            error={errors.wechatContactText}
            hint={
              <span className="flex justify-between gap-3">
                <span>告诉客户怎么加您微信，可以换行。</span>
                <span className="tabular shrink-0 text-faint">{count("wechatContactText")}</span>
              </span>
            }
          >
            {(id, describedBy) => (
              <TextArea
                id={id}
                aria-describedby={describedBy}
                rows={4}
                value={values.wechatContactText}
                invalid={Boolean(errors.wechatContactText)}
                onChange={(event) => set("wechatContactText")(event.target.value)}
                maxLength={LIMIT.wechatContactText}
                placeholder={"例如：微信号 wm-wujin\n加好友请备注「订货」"}
              />
            )}
          </Field>
        </fieldset>
      </Card>

      <Button type="submit" className="w-full" disabled={!changed || saving}>
        {saving ? "正在保存…" : changed ? "保存" : "已保存"}
      </Button>
      {changed && !saving && (
        <button
          type="button"
          onClick={() => {
            setValues(saved);
            setErrors({});
          }}
          className="flex min-h-tap w-full items-center justify-center text-[15px] text-muted"
        >
          放弃修改
        </button>
      )}
    </form>
  );
}
