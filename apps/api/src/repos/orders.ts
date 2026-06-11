import { db } from "../db.js";
import type { OrderStatus } from "@thapsus/shared";

export interface Order {
  id: string;
  userId: string;
  orderNumber: string;
  status: OrderStatus;
  deliveryAddressId: string | null;
  deliveryAddressSnap: Record<string, unknown> | null;
  estimatedDeliveryAt: string | null;
  deliveredAt: string | null;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  dutyCents: number;
  vatCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: string | null;
  paymentRef: string | null;
  paidAt: string | null;
  trackingNumber: string | null;
  promotionId: string | null;
  quoteId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  productNameSnap: string;
  productImageSnap: string | null;
  variantAttrsSnap: Record<string, string> | null;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
}

function mapOrder(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    orderNumber: row.order_number as string,
    status: row.status as OrderStatus,
    deliveryAddressId: row.delivery_address_id as string | null,
    deliveryAddressSnap: row.delivery_address_snap as Record<string, unknown> | null,
    estimatedDeliveryAt: row.estimated_delivery_at as string | null,
    deliveredAt: row.delivered_at as string | null,
    subtotalCents: Number(row.subtotal_cents),
    shippingCents: Number(row.shipping_cents),
    taxCents: Number(row.tax_cents),
    dutyCents: Number(row.duty_cents ?? 0),
    vatCents: Number(row.vat_cents ?? 0),
    discountCents: Number(row.discount_cents),
    totalCents: Number(row.total_cents),
    paymentMethod: row.payment_method as string | null,
    paymentRef: row.payment_ref as string | null,
    paidAt: row.paid_at as string | null,
    trackingNumber: row.tracking_number as string | null,
    promotionId: row.promotion_id as string | null,
    quoteId: row.quote_id as string | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapOrderItem(row: Record<string, unknown>): OrderItem {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    productId: row.product_id as string,
    variantId: row.variant_id as string | null,
    productNameSnap: row.product_name_snap as string,
    productImageSnap: row.product_image_snap as string | null,
    variantAttrsSnap: row.variant_attrs_snap as Record<string, string> | null,
    qty: Number(row.qty),
    unitPriceCents: Number(row.unit_price_cents),
    totalCents: Number(row.total_cents),
  };
}

export interface CreateOrderData {
  userId: string;
  deliveryAddressId: string;
  deliveryAddressSnap: Record<string, unknown>;
  estimatedDeliveryAt: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  dutyCents: number;
  vatCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: string;
  promotionId?: string;
  quoteId?: string;
  idempotencyKey?: string;
  notes?: string;
  items: {
    productId: string;
    variantId?: string;
    productNameSnap: string;
    productImageSnap?: string;
    variantAttrsSnap?: Record<string, string>;
    qty: number;
    unitPriceCents: number;
  }[];
}

/**
 * Creates the order + items in one transaction. Idempotent: a replay with the
 * same (user, Idempotency-Key) or the same quote returns the original order
 * instead of creating a duplicate.
 */
export async function create(data: CreateOrderData): Promise<{ order: Order; replayed: boolean }> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows: [order] } = await client.query(
      `INSERT INTO orders (
         user_id, delivery_address_id, delivery_address_snap,
         estimated_delivery_at, subtotal_cents, shipping_cents,
         tax_cents, duty_cents, vat_cents, discount_cents, total_cents,
         payment_method, promotion_id, quote_id, idempotency_key, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        data.userId,
        data.deliveryAddressId,
        JSON.stringify(data.deliveryAddressSnap),
        data.estimatedDeliveryAt,
        data.subtotalCents,
        data.shippingCents,
        data.taxCents,
        data.dutyCents,
        data.vatCents,
        data.discountCents,
        data.totalCents,
        data.paymentMethod,
        data.promotionId ?? null,
        data.quoteId ?? null,
        data.idempotencyKey ?? null,
        data.notes ?? null,
      ],
    );

    for (const item of data.items) {
      await client.query(
        `INSERT INTO order_items (
           order_id, product_id, variant_id, product_name_snap,
           product_image_snap, variant_attrs_snap, qty, unit_price_cents, total_cents
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          order.id,
          item.productId,
          item.variantId ?? null,
          item.productNameSnap,
          item.productImageSnap ?? null,
          item.variantAttrsSnap ? JSON.stringify(item.variantAttrsSnap) : null,
          item.qty,
          item.unitPriceCents,
          item.qty * item.unitPriceCents,
        ],
      );
    }

    await client.query("COMMIT");
    return { order: mapOrder(order), replayed: false };
  } catch (err) {
    await client.query("ROLLBACK");
    // Unique violation on the idempotency key or quote linkage → fetch and
    // return the order the first request created.
    if ((err as { code?: string }).code === "23505") {
      const existing = data.idempotencyKey
        ? await findByIdempotencyKey(data.userId, data.idempotencyKey)
        : data.quoteId
          ? await findByQuoteId(data.quoteId)
          : null;
      if (existing) return { order: existing, replayed: true };
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function findByIdempotencyKey(userId: string, key: string): Promise<Order | null> {
  const { rows } = await db.query(
    `SELECT * FROM orders WHERE user_id = $1 AND idempotency_key = $2`,
    [userId, key],
  );
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function findByQuoteId(quoteId: string): Promise<Order | null> {
  const { rows } = await db.query(`SELECT * FROM orders WHERE quote_id = $1`, [quoteId]);
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function findById(id: string, userId?: string): Promise<Order | null> {
  const { rows } = await db.query(
    `SELECT * FROM orders WHERE id = $1 ${userId ? "AND user_id = $2" : ""}`,
    userId ? [id, userId] : [id],
  );
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function findByOrderNumber(orderNumber: string): Promise<Order | null> {
  const { rows } = await db.query(`SELECT * FROM orders WHERE order_number = $1`, [orderNumber]);
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function getItems(orderId: string): Promise<OrderItem[]> {
  const { rows } = await db.query(`SELECT * FROM order_items WHERE order_id = $1`, [orderId]);
  return rows.map(mapOrderItem);
}

export async function listByUser(
  userId: string,
  page = 1,
  limit = 10,
): Promise<{ orders: Order[]; total: number }> {
  const offset = (page - 1) * limit;
  const { rows } = await db.query(
    `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  const { rows: countRows } = await db.query(
    `SELECT count(*)::int AS total FROM orders WHERE user_id = $1`,
    [userId],
  );
  return { orders: rows.map(mapOrder), total: countRows[0].total };
}

export async function updateStatus(
  id: string,
  status: OrderStatus,
  extra?: { trackingNumber?: string; paymentRef?: string; paidAt?: string; deliveredAt?: string },
): Promise<Order | null> {
  const { rows } = await db.query(
    `UPDATE orders
     SET status          = $2,
         tracking_number = COALESCE($3, tracking_number),
         payment_ref     = COALESCE($4, payment_ref),
         paid_at         = COALESCE($5::timestamptz, paid_at),
         delivered_at    = COALESCE($6::timestamptz, delivered_at),
         updated_at      = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      status,
      extra?.trackingNumber ?? null,
      extra?.paymentRef ?? null,
      extra?.paidAt ?? null,
      extra?.deliveredAt ?? null,
    ],
  );
  return rows[0] ? mapOrder(rows[0]) : null;
}

export type AdminOrder = Order & { customerName: string | null; customerEmail: string | null };

export async function listAll(opts: {
  status?: OrderStatus;
  userId?: string;
  page?: number;
  limit?: number;
}): Promise<{ orders: AdminOrder[]; total: number }> {
  const { page = 1, limit = 25 } = opts;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (opts.status) {
    params.push(opts.status);
    conditions.push(`o.status = $${pi++}`);
  }
  if (opts.userId) {
    params.push(opts.userId);
    conditions.push(`o.user_id = $${pi++}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit, offset);

  const { rows } = await db.query(
    `SELECT o.*, u.full_name AS customer_name, u.email AS customer_email
     FROM orders o LEFT JOIN users u ON u.id = o.user_id
     ${where} ORDER BY o.created_at DESC LIMIT $${pi++} OFFSET $${pi++}`,
    params,
  );
  const { rows: countRows } = await db.query(
    `SELECT count(*)::int AS total FROM orders o ${where}`,
    params.slice(0, -2),
  );
  return {
    orders: rows.map((row) => ({
      ...mapOrder(row),
      customerName: (row.customer_name as string | null) ?? null,
      customerEmail: (row.customer_email as string | null) ?? null,
    })),
    total: countRows[0].total,
  };
}
