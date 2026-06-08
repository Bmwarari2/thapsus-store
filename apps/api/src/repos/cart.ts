import { db } from "../db.js";

export interface CartItem {
  id: string;
  cartId: string;
  productId: string;
  variantId: string | null;
  qty: number;
  priceSnapshotCents: number;
  addedAt: string;
  // Joined product fields
  productName?: string;
  productSlug?: string;
  productImage?: string;
  variantAttributes?: Record<string, string> | null;
  currentPriceCents?: number;   // live price for stale-price warning
}

function mapItem(row: Record<string, unknown>): CartItem {
  return {
    id: row.id as string,
    cartId: row.cart_id as string,
    productId: row.product_id as string,
    variantId: row.variant_id as string | null,
    qty: Number(row.qty),
    priceSnapshotCents: Number(row.price_snapshot_cents),
    addedAt: row.added_at as string,
    productName: row.product_name as string | undefined,
    productSlug: row.product_slug as string | undefined,
    productImage: row.product_image as string | undefined,
    variantAttributes: row.variant_attributes as Record<string, string> | null | undefined,
    currentPriceCents: row.current_price_cents != null ? Number(row.current_price_cents) : undefined,
  };
}

export async function getOrCreateCart(userId: string): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO carts (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [userId],
  );
  return rows[0].id as string;
}

export async function getCartWithItems(userId: string): Promise<{ cartId: string; items: CartItem[] }> {
  const cartId = await getOrCreateCart(userId);
  const { rows } = await db.query(
    `SELECT ci.*,
            p.name  AS product_name,
            p.slug  AS product_slug,
            p.images[1] AS product_image,
            pv.attributes AS variant_attributes,
            (p.sell_price_kes_cents + COALESCE(pv.price_delta_kes_cents, 0)) AS current_price_cents
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     LEFT JOIN product_variants pv ON pv.id = ci.variant_id
     WHERE ci.cart_id = $1
     ORDER BY ci.added_at`,
    [cartId],
  );
  return { cartId, items: rows.map(mapItem) };
}

export async function addItem(
  userId: string,
  productId: string,
  variantId: string | null,
  qty: number,
  priceSnapshotCents: number,
): Promise<CartItem> {
  const cartId = await getOrCreateCart(userId);
  const { rows } = await db.query(
    `INSERT INTO cart_items (cart_id, product_id, variant_id, qty, price_snapshot_cents)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (cart_id, product_id, variant_id)
     DO UPDATE SET qty = cart_items.qty + $4, added_at = now()
     RETURNING *`,
    [cartId, productId, variantId ?? null, qty, priceSnapshotCents],
  );
  await db.query(`UPDATE carts SET updated_at = now() WHERE id = $1`, [cartId]);
  return mapItem(rows[0]);
}

export async function updateItem(
  userId: string,
  itemId: string,
  qty: number,
): Promise<CartItem | null> {
  const { rows } = await db.query(
    `UPDATE cart_items ci
     SET qty = $3
     FROM carts c
     WHERE ci.id = $1 AND c.id = ci.cart_id AND c.user_id = $2
     RETURNING ci.*`,
    [itemId, userId, qty],
  );
  return rows[0] ? mapItem(rows[0]) : null;
}

export async function removeItem(userId: string, itemId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `DELETE FROM cart_items ci
     USING carts c
     WHERE ci.id = $1 AND c.id = ci.cart_id AND c.user_id = $2`,
    [itemId, userId],
  );
  return (rowCount ?? 0) > 0;
}

export async function clearCart(userId: string): Promise<void> {
  await db.query(
    `DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)`,
    [userId],
  );
}

export async function mergeGuestCart(
  userId: string,
  guestItems: { productId: string; variantId?: string; qty: number; priceSnapshotCents: number }[],
): Promise<void> {
  const cartId = await getOrCreateCart(userId);
  for (const item of guestItems) {
    await db.query(
      `INSERT INTO cart_items (cart_id, product_id, variant_id, qty, price_snapshot_cents)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (cart_id, product_id, variant_id)
       DO UPDATE SET qty = GREATEST(cart_items.qty, $4)`,
      [cartId, item.productId, item.variantId ?? null, item.qty, item.priceSnapshotCents],
    );
  }
}
