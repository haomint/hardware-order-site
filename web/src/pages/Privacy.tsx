import { useEffect } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useShop } from "../lib/shop.tsx";
import { BackIcon } from "../components/icons.tsx";

/** 订单信息的保存期限。由店主确认后修改这里，页面其他地方不用动。 */
const RETENTION = "订单完成或取消后保存 3 年，用于售后和对账，到期后删除";
/** 本页文字最后修改的日期。改动文字时一并更新。 */
const UPDATED_AT = "2026 年 11 月 13 日";

export function Privacy() {
  const shop = useShop();
  const navigate = useNavigate();
  const shopName = shop?.name ?? "本店";
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate("/"));

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `隐私说明 - ${shopName}`;
  }, [shopName]);

  return (
    <div className="mx-auto min-h-screen max-w-shell pb-10">
      <header className="sticky top-0 z-30 flex h-12 items-center border-b border-line bg-surface/95 px-1">
        <button type="button" onClick={goBack} className="flex min-h-tap items-center gap-0.5 pl-2 pr-3 text-base text-ink active:opacity-60">
          <BackIcon />
          返回
        </button>
      </header>

      <main className="px-4 pt-5">
        <h1 className="text-[22px] font-extrabold text-ink">隐私说明</h1>
        <p className="mt-1 text-[13px] text-muted">
          {shopName} · 更新于 {UPDATED_AT}
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-ink">
          浏览商品不需要注册，也不需要提供任何个人信息。只有在您提交订货单时，我们才会收到您填写的信息。下面用简单的话说明这些信息怎么使用。
        </p>

        <div className="mt-4 space-y-3">
          <Section title="我们收集哪些信息">
            <p>提交订货单时您填写的：</p>
            <ul>
              <li>联系人姓名、手机号</li>
              <li>送货还是到店自提；选择送货时的收货地址</li>
              <li>订单备注</li>
              <li>订货的商品和数量</li>
            </ul>
          </Section>

          <Section title="用来做什么">
            <p>只用于完成您的订货：</p>
            <ul>
              <li>电话或微信联系您，确认商品、价格和运费</li>
              <li>安排送货，或通知您到店自提</li>
            </ul>
            <p>不会用来推送广告或营销信息，也不会出售给任何人。</p>
          </Section>

          <Section title="谁能看到">
            <ul>
              <li>只有店铺管理员登录店铺后台后，才能看到您的完整信息</li>
              <li>店家手机上收到的新订单提醒只显示称呼和手机尾号，不显示完整手机号和地址</li>
              <li>除完成送货所必需外，不向第三方提供</li>
            </ul>
          </Section>

          <Section title="保存在哪里、保存多久">
            <ul>
              <li>订单信息保存在店铺使用的云服务器上，服务器位于中国境内，并定期备份到同一云服务商的私有存储</li>
              <li>{RETENTION}</li>
            </ul>
          </Section>

          <Section title="您手机上保存的内容">
            <ul>
              <li>购物车，以及您上次填写的联系人、手机号和地址，只保存在您自己手机的浏览器里，方便下次自动填写，不会上传</li>
              <li>清除浏览器的网站数据，即可删除这些内容</li>
              <li>本网站不使用广告追踪或访问统计</li>
            </ul>
          </Section>

          <Section title="查询、更正或删除您的信息">
            <p>如需查询、更正或删除您的订单信息，请联系店铺：</p>
            {shop?.phone || shop?.wechatContactText ? (
              <ul>
                {shop?.phone && (
                  <li>
                    电话：
                    <a href={`tel:${shop.phone}`} className="tabular font-medium text-brand">
                      {shop.phone}
                    </a>
                  </li>
                )}
                {shop?.wechatContactText && <li>{shop.wechatContactText}</li>}
              </ul>
            ) : (
              <p>请到店或通过您已有的联系方式联系店家。</p>
            )}
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-surface p-4 shadow-card">
      <h2 className="mb-2 flex items-center gap-2 text-[16px] font-bold text-ink">
        <span className="h-4 w-1 rounded-full bg-accent-gradient" aria-hidden="true" />
        {title}
      </h2>
      <div className="space-y-2 text-[15px] leading-relaxed text-ink [&_li]:relative [&_li]:pl-4 [&_li]:before:absolute [&_li]:before:left-1 [&_li]:before:top-[0.7em] [&_li]:before:h-1 [&_li]:before:w-1 [&_li]:before:rounded-full [&_li]:before:bg-muted [&_li]:before:content-[''] [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
