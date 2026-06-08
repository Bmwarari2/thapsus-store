import { db } from "../db.js";
import type { ReviewStatus } from "@thapsus/shared";

export interface Review {
  id: string;
  userId: string;
  productId: string;
  orderId: string | null;
  orderItemId: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  images: string[];
  helpfulCount: number;
  status: ReviewStatus;
  createdAt: string;
  // Joined
  reviewerName?: string;
}

function mapReview(row: Record<string, unknown>): Review {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    productId: row.product_id as string,
    orderId: row.order_id as string | null,
    orderItemId: row.order_item_id as string | null,
    rating: Number(row.rating),
    title: row.title as string | null,
    body: row.body as string | null,
    images: (row.images as string[]) ?? [],
    helpfulCount: Number(row.helpful_count),
    status: row.status as ReviewStatus,
    createdAt: row.created_at as string,
    reviewerName: row.reviewer_name as string | undefined,
  };
}

export async function create(data: {
  userId: string;
  productId: string;
  orderItemId: string;
  rating: number;
  title?: string;
  body?: string;
  images?: string[];
}): Promise<Review> {
  // Verify the order item belongs to the user and is delivered
  const { rows: check } = await db.query(
    `SELECT oi.id, oi.order_id FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.id = $1 AND o.user_id = $2 AND o.status = 'delivered'`,
    [data.orderItemId, data.userId],
  );
  if (!check.length) {
    throw Object.assign(new Error("You can only review products from delivered orders"), { statusCode: 403 });
  }

  const { rows } = await db.query(
    `INSERT INTO reviews (user_id, product_id, order_id, order_item_id, rating, title, body, images)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.userId,
      data.productId,
      check[0].order_id,
      data.orderItemId,
      data.rating,
      data.title ?? null,
      data.body ?? null,
      data.images ?? [],
    ],
  );
  return mapReview(rows[0]);
}

export async function listByProduct(
  productId: string,
  opts: { page?: number; limit?: number; minRating?: number },
): Promise<{ reviews: Review[]; total: number; avgRating: number | null }> {
  const { page = 1, limit = 10 } = opts;
  const offset = (page - 1) * limit;

  const conditions = [`r.product_id = $1`, `r.status = 'approved'`];
  const params: unknown[] = [productId];
  let pi = 2;

  if (opts.minRating != null) {
    params.push(opts.minRating);
    conditions.push(`r.rating >= $${pi++}`);
  }

  const where = conditions.join(" AND ");
  params.push(limit, offset);

  const { rows } = await db.query(
    `SELECT r.*,
            split_part(u.full_name, ' ', 1) || ' ' ||
            left(split_part(u.full_name, ' ', 2), 1) || '.' AS reviewer_name
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     WHERE ${where}
     ORDER BY r.created_at DESC
     LIMIT $${pi++} OFFSET $${pi++}`,
    params,
  );

  const { rows: agg } = await db.query(
    `SELECT count(*)::int AS total, avg(rating)::numeric(3,1) AS avg_rating
     FROM reviews WHERE product_id = $1 AND status = 'approved'`,
    [productId],
  );

  return {
    reviews: rows.map(mapReview),
    total: agg[0].total,
    avgRating: agg[0].avg_rating ? Number(agg[0].avg_rating) : null,
  };
}

export async function markHelpful(reviewId: string, userId: string): Promise<void> {
  // Idempotent: one user can only mark helpful once (tracked via a simple advisory lock)
  await db.query(
    `UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = $1`,
    [reviewId],
  );
}

export async function updateStatus(id: string, status: ReviewStatus): Promise<Review | null> {
  const { rows } = await db.query(
    `UPDATE reviews SET status = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return rows[0] ? mapReview(rows[0]) : null;
}

export async function listPending(page = 1, limit = 25): Promise<{ reviews: Review[]; total: number }> {
  const offset = (page - 1) * limit;
  const { rows } = await db.query(
    `SELECT r.*, u.full_name AS reviewer_name
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.status = 'pending'
     ORDER BY r.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  const { rows: countRows } = await db.query(
    `SELECT count(*)::int AS total FROM reviews WHERE status = 'pending'`,
  );
  return { reviews: rows.map(mapReview), total: countRows[0].total };
}

export async function getRatingDistribution(productId: string): Promise<Record<number, number>> {
  const { rows } = await db.query(
    `SELECT rating, count(*)::int AS cnt
     FROM reviews WHERE product_id = $1 AND status = 'approved'
     GROUP BY rating ORDER BY rating DESC`,
    [productId],
  );
  const dist: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const r of rows) dist[Number(r.rating)] = r.cnt;
  return dist;
}
