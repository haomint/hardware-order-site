import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  OrderCreateSchema,
  OrderReceiptSchema,
  orderSubmissionRateLimit,
  type CartLookupResult,
  type OrderReceipt,
  type ProductListItem,
} from "../../shared/index.ts";
import { transaction } from "./db.ts";
import { ApiFailure, OrderFailure } from "./errors.ts";

type OrderInput = ReturnType<typeof OrderCreateSchema.parse>;
type FindProduct = (id: string) => ProductListItem | undefined;
type ReceiptRow = {
  order_no: string;
  created_at: number;
  contact_name: string;
  items_json: string;
  estimated_total_cents: number;
  request_digest: string;
};

const beijingDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function orderPrefix(timestamp: number) {
  const { year, month, day } = Object.fromEntries(
    beijingDate.formatToParts(timestamp).map(({ type, value }) => [type, value]),
  );
  return `WJ-${year}${month}${day}-`;
}

function receiptFromRow(row: ReceiptRow) {
  return OrderReceiptSchema.parse({
    orderNo: row.order_no,
    createdAt: new Date(row.created_at).toISOString(),
    contactName: row.contact_name,
    items: JSON.parse(row.items_json),
    estimatedTotalCents: row.estimated_total_cents,
  });
}

export function createOrderSubmissionLimiter(now: () => number) {
  const { maxRequests, windowMinutes } = orderSubmissionRateLimit;
  const windowMs = windowMinutes * 60_000;
  const requestsByIp = new Map<string, number[]>();
  let nextSweep = -Infinity;

  function prune(requests: number[], cutoff: number) {
    while (requests.length && requests[0] <= cutoff) requests.shift();
  }

  return (ip: string) => {
    const timestamp = now();
    const cutoff = timestamp - windowMs;
    if (timestamp >= nextSweep) {
      for (const [address, requests] of requestsByIp) {
        prune(requests, cutoff);
        if (!requests.length) requestsByIp.delete(address);
      }
      nextSweep = timestamp + windowMs;
    }
    const requests = requestsByIp.get(ip) ?? [];
    prune(requests, cutoff);
    if (requests.length >= maxRequests) throw new OrderFailure("TOO_MANY_REQUESTS");
    requests.push(timestamp);
    requestsByIp.set(ip, requests);
  };
}

export function createOrders(
  db: DatabaseSync, findProduct: FindProduct, now: () => number,
  enqueueNotification: (orderNo: string, createdAt: number) => void,
) {
  const byKey = db.prepare(`
    SELECT order_no, created_at, contact_name, items_json, estimated_total_cents, request_digest
    FROM orders WHERE idempotency_key = ?
  `);
  const lastNumber = db.prepare(`
    SELECT order_no FROM orders WHERE order_no BETWEEN ? AND ? ORDER BY order_no DESC LIMIT 1
  `);
  const insert = db.prepare(`
    INSERT INTO orders (
      order_no, idempotency_key, request_digest, created_at, contact_name, phone,
      delivery_method, address, note, items_json, estimated_total_cents
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  function lookupCart(productIds: string[]): CartLookupResult {
    return {
      items: productIds.map((productId) => {
        const product = findProduct(productId);
        if (!product) return { productId, availability: "unavailable" };
        return { productId, availability: product.isOutOfStock ? "out_of_stock" : "available", product };
      }),
    };
  }

  return {
    lookupCart,
    submit(input: OrderInput, key: string) {
      const address = input.deliveryMethod === "pickup" ? null : input.address ?? null;
      const items = input.items.map(({ productId, quantity }) => ({ productId: productId.toLowerCase(), quantity }));
      const normalized = {
        contactName: input.contactName,
        phone: input.phone,
        deliveryMethod: input.deliveryMethod,
        address,
        note: input.note,
        items: [...items].sort((a, b) => a.productId.localeCompare(b.productId)),
      };
      const digest = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
      const idempotencyKey = key.toLowerCase();

      return transaction(db, () => {
        const existing = byKey.get(idempotencyKey) as ReceiptRow | undefined;
        if (existing) {
          if (existing.request_digest !== digest) throw new OrderFailure("IDEMPOTENCY_KEY_CONFLICT");
          return { receipt: receiptFromRow(existing), replayed: true };
        }

        const checked = lookupCart(input.items.map(({ productId }) => productId)).items;
        const unavailableItems = checked.flatMap((item) => item.availability === "available" ? [] : [
          { productId: item.productId, reason: item.availability },
        ]);
        if (unavailableItems.length) throw new OrderFailure("ORDER_PRODUCTS_UNAVAILABLE", unavailableItems);

        let total = 0n;
        const snapshots: OrderReceipt["items"] = [];
        for (const [index, item] of checked.entries()) {
          if (item.availability === "unavailable") throw new ApiFailure("INTERNAL_ERROR");
          const { id: productId, name, brand, model, unit, priceCents: unitPriceCents } = item.product;
          const { quantity } = items[index];
          const subtotal = unitPriceCents === null ? null : BigInt(unitPriceCents) * BigInt(quantity);
          total += subtotal ?? 0n;
          if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new OrderFailure("ORDER_TOTAL_TOO_LARGE");
          snapshots.push({
            productId, name, brand, model, unit, unitPriceCents, quantity,
            subtotalCents: subtotal === null ? null : Number(subtotal),
          });
        }

        const timestamp = now();
        const prefix = orderPrefix(timestamp);
        const last = lastNumber.get(prefix + "0000", prefix + "9999")?.order_no;
        const sequence = typeof last === "string" ? Number(last.slice(-4)) + 1 : 1;
        if (sequence > 9999) throw new ApiFailure("INTERNAL_ERROR");

        const receipt = OrderReceiptSchema.parse({
          orderNo: prefix + String(sequence).padStart(4, "0"),
          createdAt: new Date(timestamp).toISOString(),
          contactName: input.contactName,
          items: snapshots,
          estimatedTotalCents: Number(total),
        });
        insert.run(
          receipt.orderNo, idempotencyKey, digest, timestamp, input.contactName, input.phone,
          input.deliveryMethod, address, input.note, JSON.stringify(receipt.items), receipt.estimatedTotalCents,
        );
        enqueueNotification(receipt.orderNo, timestamp);
        return { receipt, replayed: false };
      });
    },
  };
}
