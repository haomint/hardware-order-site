import { orderCsvColumns, orderCsvLabels, type OrderDetail, type OrderExportQuery } from "../../shared/index.ts";

const beijingTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function beijingParts(timestamp: number) {
  return Object.fromEntries(beijingTime.formatToParts(timestamp).map(({ type, value }) => [type, value]));
}

function fileDate(timestamp: number) {
  const { year, month, day } = beijingParts(timestamp);
  return `${year}${month}${day}`;
}

export function orderCsvDisposition({ from, to }: OrderExportQuery) {
  const range = `${fileDate(Date.parse(from))}-${fileDate(Date.parse(to) - 1)}`;
  const name = encodeURIComponent(`订单_${range}.csv`);
  return `attachment; filename="orders_${range}.csv"; filename*=UTF-8''${name}`;
}

function money(cents: number | null) {
  if (cents === null) return "";
  const digits = String(cents).padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function safeText(value: string) {
  return /^[=+@-]/.test(value.trimStart()) ? "'" + value : value;
}

function csvRow(cells: readonly string[]) {
  return cells.map((cell) => /[",\r\n]/.test(cell) ? '"' + cell.replaceAll('"', '""') + '"' : cell).join(",") + "\r\n";
}

function orderRow(order: OrderDetail) {
  const { year, month, day, hour, minute } = beijingParts(Date.parse(order.createdAt));
  const items = order.items.map(({ name, model, quantity, subtotalCents }) => {
    const trimmedModel = model.trim();
    const label = trimmedModel && !name.trim().toLowerCase().includes(trimmedModel.toLowerCase())
      ? `${name} ${trimmedModel}`
      : name;
    const subtotal = subtotalCents === null ? "面议" : `¥${money(subtotalCents)}`;
    return `${label} ×${quantity}（${subtotal}）`;
  }).join("；");
  // orderDetail 已使用共享契约验证手机号为 11 位纯数字。
  return csvRow([
    order.orderNo,
    `${year}-${month}-${day} ${hour}:${minute}`,
    safeText(order.contactName),
    `="${order.phone}"`,
    orderCsvLabels.deliveryMethod[order.deliveryMethod],
    safeText(order.address ?? ""),
    safeText(order.note),
    safeText(items),
    money(order.estimatedTotalCents),
    money(order.finalTotalCents),
    orderCsvLabels.status[order.status],
    orderCsvLabels.paymentStatus[order.paymentStatus],
  ]);
}

export function streamOrderCsv(orders: Generator<OrderDetail>) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("\uFEFF" + csvRow(orderCsvColumns)));
    },
    pull(controller) {
      try {
        let chunk = "";
        for (let index = 0; index < 32; index += 1) {
          const next = orders.next();
          if (next.done) {
            if (chunk) controller.enqueue(encoder.encode(chunk));
            controller.close();
            return;
          }
          chunk += orderRow(next.value);
        }
        controller.enqueue(encoder.encode(chunk));
      } catch (error) {
        orders.return(undefined);
        controller.error(error);
      }
    },
    cancel() {
      orders.return(undefined);
    },
  });
}
