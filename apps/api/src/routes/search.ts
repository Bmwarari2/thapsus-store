import { Router } from "express";
import { db } from "../db.js";
import { envelope } from "../middleware.js";

const r = Router();

r.get("/", async (req, res) => {
  const { q, category, min_price, max_price, sort = "newest", page = "1", limit = "24" } = req.query as Record<string, string>;

  if (!q?.trim()) {
    return res.json(envelope({ products: [], total: 0, query: "" }));
  }

  const conditions = ["p.is_active = true", "p.search_vector @@ plainto_tsquery('english', $1)"];
  const params: unknown[] = [q.trim()];
  let pi = 2;

  if (category) {
    params.push(category);
    conditions.push(`c.slug = $${pi++}`);
  }
  if (min_price) {
    params.push(Number(min_price) * 100);
    conditions.push(`p.sell_price_kes_cents >= $${pi++}`);
  }
  if (max_price) {
    params.push(Number(max_price) * 100);
    conditions.push(`p.sell_price_kes_cents <= $${pi++}`);
  }

  const orderMap: Record<string, string> = {
    relevance:  "ts_rank(p.search_vector, plainto_tsquery('english', $1)) DESC",
    newest:     "p.created_at DESC",
    popular:    "p.order_count DESC",
    price_asc:  "p.sell_price_kes_cents ASC",
    price_desc: "p.sell_price_kes_cents DESC",
  };
  const orderBy = orderMap[sort] ?? orderMap.relevance;

  const where = conditions.join(" AND ");
  const pageNum = Math.max(1, Number(page));
  const pageSize = Math.min(Number(limit), 96);
  const offset = (pageNum - 1) * pageSize;

  params.push(pageSize, offset);

  const { rows } = await db.query(
    `SELECT p.id, p.name, p.slug, p.images[1] AS image, p.sell_price_kes_cents,
            p.rating, p.review_count, p.estimated_days_min, p.estimated_days_max,
            c.name AS category_name, c.slug AS category_slug
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${where}
     ORDER BY ${orderBy}
     LIMIT $${pi++} OFFSET $${pi++}`,
    params,
  );

  const { rows: countRows } = await db.query(
    `SELECT count(*)::int AS total FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${where}`,
    params.slice(0, -2),
  );

  return res.json(envelope({ products: rows, total: countRows[0].total, query: q.trim() }));
});

// Typeahead suggestions — fast, returns names only
r.get("/suggestions", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json(envelope([]));

  const { rows } = await db.query(
    `SELECT DISTINCT name
     FROM products
     WHERE is_active = true
       AND search_vector @@ plainto_tsquery('english', $1)
     ORDER BY order_count DESC
     LIMIT 8`,
    [q],
  );
  return res.json(envelope(rows.map((r: { name: string }) => r.name)));
});

export default r;
