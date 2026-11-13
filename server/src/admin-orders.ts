import type { DatabaseSync } from "node:sqlite";
import {
  AdminOrderQuerySchema, OrderDetailSchema, type OrderDetail, type OrderPage, type UpdateOrder,
} from "../../shared/index.ts";
import { transaction } from "./db.ts";
import { OrderFailure } from "./errors.ts";

type Query = ReturnType<typeof AdminOrderQuerySchema.parse>;
type OrderRow = {
  order_no: string;
  created_at: number;
  updated_at: number | null;
  contact_name: string;
  phone: string;
  delivery_method: OrderDetail["deliveryMethod"];
  status: OrderDetail["status"];
  payment_status: OrderDetail["paymentStatus"];
  estimated_total_cents: number;
  final_total_cents: number | null;
  items_json: string;
  address: string | null;
  note: string;
  admin_note: string;
  cancellation_reason: string | null;
  status_updated_at: number | null;
  payment_status_updated_at: number | null;
  admin_note_updated_at: number | null;
  final_total_updated_at: number | null;
  cancellation_reason_updated_at: number | null;
};

const iso = (timestamp: number) => new Date(timestamp).toISOString();
const optionalIso = (timestamp: number | null) => timestamp === null ? null : iso(timestamp);

function orderSummary(row: OrderRow, items: OrderDetail["items"]): OrderPage["items"][number] {
  return {
    orderNo: row.order_no,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at ?? row.created_at),
    contactName: row.contact_name,
    phone: row.phone,
    deliveryMethod: row.delivery_method,
    status: row.status,
    paymentStatus: row.payment_status,
    itemCount: items.length,
    itemsPreview: items.slice(0, 2).map(({ name, quantity }) => ({ name, quantity })),
    estimatedTotalCents: row.estimated_total_cents,
    finalTotalCents: row.final_total_cents,
  };
}

function orderDetail(row: OrderRow) {
  const items = JSON.parse(row.items_json) as OrderDetail["items"];
  return OrderDetailSchema.parse({
    ...orderSummary(row, items),
    items,
    address: row.address,
    note: row.note,
    adminNote: row.admin_note,
    cancellationReason: row.cancellation_reason,
    statusUpdatedAt: iso(row.status_updated_at ?? row.created_at),
    paymentStatusUpdatedAt: iso(row.payment_status_updated_at ?? row.created_at),
    adminNoteUpdatedAt: optionalIso(row.admin_note_updated_at),
    finalTotalUpdatedAt: optionalIso(row.final_total_updated_at),
    cancellationReasonUpdatedAt: optionalIso(row.cancellation_reason_updated_at),
  });
}

export function createAdminOrders(db: DatabaseSync, now: () => number) {
  const byNumber = db.prepare("SELECT * FROM orders WHERE order_no = ?");
  const filter = `
    WHERE (:status IS NULL OR status = :status)
      AND (:paymentStatus IS NULL OR payment_status = :paymentStatus)
      AND (:from IS NULL OR created_at >= :from)
      AND (:to IS NULL OR created_at < :to)
      AND (:q = '' OR instr(lower(order_no), :q) > 0 OR instr(phone, :q) > 0)
  `;
  const count = db.prepare(`SELECT count(*) AS total FROM orders ${filter}`);
  const page = db.prepare(`
    SELECT * FROM orders ${filter}
    ORDER BY created_at DESC, order_no DESC LIMIT :limit OFFSET :offset
  `);
  const update = db.prepare(`
    UPDATE orders SET
      status = :status, payment_status = :paymentStatus, admin_note = :adminNote,
      cancellation_reason = :cancellationReason, final_total_cents = :finalTotalCents,
      status_updated_at = :statusUpdatedAt, payment_status_updated_at = :paymentStatusUpdatedAt,
      admin_note_updated_at = :adminNoteUpdatedAt, cancellation_reason_updated_at = :cancellationReasonUpdatedAt,
      final_total_updated_at = :finalTotalUpdatedAt, updated_at = :updatedAt
    WHERE order_no = :orderNo
  `);

  function requireOrder(orderNo: string) {
    const row = byNumber.get(orderNo) as OrderRow | undefined;
    if (!row) throw new OrderFailure("ORDER_NOT_FOUND");
    return row;
  }

  return {
    list(query: Query): OrderPage {
      const filters = {
        status: query.status ?? null,
        paymentStatus: query.paymentStatus ?? null,
        from: query.from ? Date.parse(query.from) : null,
        to: query.to ? Date.parse(query.to) : null,
        q: (query.q ?? "").toLowerCase(),
      };
      const limit = Number(query.pageSize);
      const offset = (Number(query.page) - 1) * limit;
      const total = Number(count.get(filters)?.total);
      const rows = page.all({ ...filters, limit, offset }) as OrderRow[];
      return { total, items: rows.map((row) => orderSummary(row, JSON.parse(row.items_json))) };
    },
    get(orderNo: string): OrderDetail {
      return orderDetail(requireOrder(orderNo));
    },
    update(orderNo: string, patch: UpdateOrder): OrderDetail {
      return transaction(db, () => {
        const row = requireOrder(orderNo);
        const status = patch.status ?? row.status;
        if (patch.cancellationReason !== undefined && status !== "cancelled") {
          throw new OrderFailure("ORDER_STATUS_CONFLICT");
        }
        const paymentStatus = patch.paymentStatus ?? row.payment_status;
        const adminNote = patch.adminNote ?? row.admin_note;
        const cancellationReason = patch.cancellationReason ?? row.cancellation_reason;
        const finalTotalCents = patch.finalTotalCents === undefined ? row.final_total_cents : patch.finalTotalCents;
        const statusChanged = status !== row.status;
        const paymentChanged = paymentStatus !== row.payment_status;
        const noteChanged = adminNote !== row.admin_note;
        const reasonChanged = cancellationReason !== row.cancellation_reason;
        const totalChanged = finalTotalCents !== row.final_total_cents;
        if (!(statusChanged || paymentChanged || noteChanged || reasonChanged || totalChanged)) {
          return orderDetail(row);
        }

        const updatedAt = now();
        update.run({
          orderNo, status, paymentStatus, adminNote, cancellationReason, finalTotalCents, updatedAt,
          statusUpdatedAt: statusChanged ? updatedAt : row.status_updated_at,
          paymentStatusUpdatedAt: paymentChanged ? updatedAt : row.payment_status_updated_at,
          adminNoteUpdatedAt: noteChanged ? updatedAt : row.admin_note_updated_at,
          cancellationReasonUpdatedAt: reasonChanged ? updatedAt : row.cancellation_reason_updated_at,
          finalTotalUpdatedAt: totalChanged ? updatedAt : row.final_total_updated_at,
        });
        return orderDetail(requireOrder(orderNo));
      });
    },
  };
}
