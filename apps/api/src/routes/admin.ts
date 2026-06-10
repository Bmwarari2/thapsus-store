import { Router } from "express";
import { CreateProductSchema, UpdateProductSchema, CreateImportJobSchema } from "@thapsus/shared";
import { envelope, errorEnvelope, requireAdmin } from "../middleware.js";
import * as products from "../repos/products.js";
import * as orders from "../repos/orders.js";
import * as reviewRepo from "../repos/reviews.js";
import { priceItem, repriceAllProducts, invalidatePricingCache } from "../services/pricing.js";
import type { SourceCurrency } from "@thapsus/shared";
import { sendOrderShipped, sendOrderDelivered } from "../services/email.js";
import { db } from "../db.js";
import type { OrderStatus } from "@thapsus/shared";

const r = Router();

r.use(requireAdmin);

// ── Products ──────────────────────────────────────────────────────────────────

r.get("/products", async (req, res) => {
  const { page, limit, category, q, active } = req.query as Record<string, string>;
  const result = await products.list({
    categorySlug: category,
    search: q,
    page: Number(page ?? 1),
    limit: Math.min(Number(limit ?? 25), 100),
  });
  return res.json(envelope(result));
});

r.post("/products", async (req, res) => {
  const parsed = CreateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorEnvelope("validation", "Invalid product", parsed.error.flatten()));
  }
  const d = parsed.data;

  const sellPriceKesCents = await priceItem(d.sourcePriceUsdCents, "USD", d.markupPct);

  // Resolve or create brand
  let brandId: string | undefined;
  if (d.brandName) {
    const slug = d.brandName.toLowerCase().replace(/\s+/g, "-");
    const { rows } = await db.query(
      `INSERT INTO brands (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [d.brandName, slug],
    );
    brandId = rows[0].id;
  }

  const product = await products.create({
    name: d.name,
    description: d.description,
    categoryId: d.categoryId,
    brandId,
    tags: d.tags,
    images: d.images,
    sourcePriceUsdCents: d.sourcePriceUsdCents,
    markupPct: d.markupPct,
    sellPriceKesCents,
    weightGrams: d.weightGrams,
    weightSource: "manual",
    estimatedDaysMin: d.estimatedDaysMin,
    estimatedDaysMax: d.estimatedDaysMax,
    sourcePlatform: d.sourcePlatform,
    sourceUrl: d.sourceUrl,
  });

  return res.status(201).json(envelope(product));
});

r.patch("/products/:id", async (req, res) => {
  const parsed = UpdateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorEnvelope("validation", "Invalid input", parsed.error.flatten()));
  }

  const existing = await products.findById(req.params.id);
  if (!existing) return res.status(404).json(errorEnvelope("not_found", "Product not found"));

  // Recompute pricing if source price or markup changed
  let pricingUpdate: Partial<{ sellPriceKesCents: number }> = {};
  if (parsed.data.sourcePriceUsdCents != null || parsed.data.markupPct != null) {
    pricingUpdate = {
      sellPriceKesCents: await priceItem(
        parsed.data.sourcePriceUsdCents ?? existing.sourcePriceUsdCents,
        existing.sourceCurrency as SourceCurrency,
        parsed.data.markupPct ?? existing.markupPct,
      ),
    };
  }

  // An admin-set weight is an explicit override.
  const weightUpdate = parsed.data.weightGrams != null ? { weightSource: "manual" } : {};

  const updated = await products.update(req.params.id, { ...parsed.data, ...pricingUpdate, ...weightUpdate });
  return res.json(envelope(updated));
});

r.delete("/products/:id", async (req, res) => {
  await products.update(req.params.id, { isActive: false });
  return res.json(envelope({ deactivated: true }));
});

r.post("/products/:id/variants", async (req, res) => {
  const variant = await products.addVariant(req.params.id, req.body);
  return res.status(201).json(envelope(variant));
});

r.post("/products/reprice-all", async (_req, res) => {
  const updated = await repriceAllProducts();
  return res.json(envelope({ updated }));
});

// ── Orders ────────────────────────────────────────────────────────────────────

r.get("/orders", async (req, res) => {
  const { status, page } = req.query as Record<string, string>;
  const result = await orders.listAll({
    status: status as OrderStatus | undefined,
    page: Number(page ?? 1),
  });
  return res.json(envelope(result));
});

r.patch("/orders/:id/status", async (req, res) => {
  const { status, trackingNumber, note } = req.body ?? {};
  const validStatuses: OrderStatus[] = [
    "payment_confirmed", "sourcing", "shipped_to_hub", "at_hub",
    "out_for_delivery", "delivered", "cancelled", "refund_requested", "refunded",
  ];
  if (!validStatuses.includes(status)) {
    return res.status(400).json(errorEnvelope("validation", "Invalid status"));
  }

  const order = await orders.findById(req.params.id);
  if (!order) return res.status(404).json(errorEnvelope("not_found", "Order not found"));

  const updated = await orders.updateStatus(order.id, status, {
    trackingNumber,
    deliveredAt: status === "delivered" ? new Date().toISOString() : undefined,
  });

  // Push in-app notification
  await db.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      order.userId,
      `order_${status}`,
      `Order ${order.orderNumber} Update`,
      note ?? `Your order status has been updated to: ${status.replace(/_/g, " ")}`,
      JSON.stringify({ order_id: order.id }),
    ],
  );

  // Email triggers
  const { rows: userRows } = await db.query(`SELECT email FROM users WHERE id = $1`, [order.userId]);
  const email = userRows[0]?.email;
  if (email) {
    if (status === "shipped_to_hub" && trackingNumber && order.estimatedDeliveryAt) {
      sendOrderShipped(email, {
        orderNumber: order.orderNumber,
        trackingNumber,
        estimatedDelivery: order.estimatedDeliveryAt,
      }).catch(() => null);
    }
    if (status === "delivered") {
      sendOrderDelivered(email, { orderNumber: order.orderNumber, orderId: order.id }).catch(() => null);
    }
  }

  // Log action
  await db.query(
    `INSERT INTO admin_logs (actor_id, action, entity, entity_id, meta)
     VALUES ($1, 'update_order_status', 'order', $2, $3)`,
    [req.user!.id, order.id, JSON.stringify({ from: order.status, to: status })],
  );

  return res.json(envelope(updated));
});

// ── Import Jobs (Scraping) ────────────────────────────────────────────────────

r.get("/import-jobs", async (_req, res) => {
  const { rows } = await db.query(
    `SELECT ij.*, c.name AS category_name
     FROM import_jobs ij
     LEFT JOIN categories c ON c.id = ij.category_id
     ORDER BY ij.created_at DESC LIMIT 100`,
  );
  return res.json(envelope(rows));
});

r.post("/import-jobs", async (req, res) => {
  const parsed = CreateImportJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorEnvelope("validation", "Invalid job params", parsed.error.flatten()));
  }

  const { rows: [job] } = await db.query(
    `INSERT INTO import_jobs (source_platform, source_url, search_query, category_id, max_products, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      parsed.data.sourcePlatform,
      parsed.data.sourceUrl ?? null,
      parsed.data.searchQuery ?? null,
      parsed.data.categoryId ?? null,
      parsed.data.maxProducts ?? null,
      req.user!.id,
    ],
  );

  // Push to BullMQ worker queue
  try {
    const { getImportQueue } = await import("../queue.js");
    await getImportQueue().add("import-product", { jobId: job.id }, { jobId: job.id });
  } catch {
    // Queue unreachable — the row stays 'queued' and the worker's stranded-job
    // sweep enqueues it within ~10 minutes.
  }

  return res.status(202).json(envelope(job));
});

r.get("/import-jobs/:id", async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM import_jobs WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json(errorEnvelope("not_found", "Job not found"));
  return res.json(envelope(rows[0]));
});

// ── Reviews Moderation ────────────────────────────────────────────────────────

r.get("/reviews", async (req, res) => {
  const { page } = req.query as Record<string, string>;
  const result = await reviewRepo.listPending(Number(page ?? 1));
  return res.json(envelope(result));
});

r.patch("/reviews/:id", async (req, res) => {
  const { status } = req.body ?? {};
  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json(errorEnvelope("validation", "Status must be approved or rejected"));
  }
  const review = await reviewRepo.updateStatus(req.params.id, status);
  if (!review) return res.status(404).json(errorEnvelope("not_found", "Review not found"));

  // Refresh product rating cache when approving
  if (status === "approved") {
    products.updateRatingCache(review.productId).catch(() => null);
  }
  return res.json(envelope(review));
});

// ── Pricing Config ────────────────────────────────────────────────────────────

r.get("/pricing-config", async (_req, res) => {
  const { rows } = await db.query(`SELECT * FROM pricing_config ORDER BY key`);
  return res.json(envelope(rows));
});

r.patch("/pricing-config", async (req, res) => {
  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== "object") {
    return res.status(400).json(errorEnvelope("validation", "Object of key:value pairs required"));
  }

  for (const [key, value] of Object.entries(updates)) {
    await db.query(
      `UPDATE pricing_config SET value = $2, updated_at = now() WHERE key = $1`,
      [key, String(value)],
    );
  }
  invalidatePricingCache();

  return res.json(envelope({ updated: Object.keys(updates).length }));
});

// ── Scrape budget gauge ───────────────────────────────────────────────────────

r.get("/scrape-budget", async (_req, res) => {
  const [{ rows: callRows }, { rows: cfgRows }] = await Promise.all([
    db.query(`SELECT count(*)::int AS used FROM scrape_calls WHERE created_at >= date_trunc('day', now())`),
    db.query(`SELECT value FROM pricing_config WHERE key = 'scrape_daily_budget'`),
  ]);
  return res.json(envelope({
    usedToday: callRows[0].used,
    dailyBudget: Number(cfgRows[0]?.value ?? 400),
  }));
});

// ── Categories ────────────────────────────────────────────────────────────────

r.post("/categories", async (req, res) => {
  const { name, slug, parentId, icon, imageUrl, sortOrder } = req.body ?? {};
  if (!name || !slug) return res.status(400).json(errorEnvelope("validation", "name and slug required"));

  const { rows } = await db.query(
    `INSERT INTO categories (name, slug, parent_id, icon, image_url, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name, slug, parentId ?? null, icon ?? null, imageUrl ?? null, sortOrder ?? 0],
  );
  return res.status(201).json(envelope(rows[0]));
});

// ── Analytics ────────────────────────────────────────────────────────────────

r.get("/analytics", async (_req, res) => {
  const [revenue, orderCounts, topProducts, recentOrders] = await Promise.all([
    db.query(`
      SELECT
        sum(CASE WHEN paid_at >= now() - interval '1 day'  THEN total_cents END) AS today,
        sum(CASE WHEN paid_at >= now() - interval '7 days' THEN total_cents END) AS week,
        sum(CASE WHEN paid_at >= now() - interval '30 days' THEN total_cents END) AS month,
        sum(total_cents) AS all_time
      FROM orders
      WHERE paid_at IS NOT NULL AND status NOT IN ('cancelled', 'refunded')
    `),
    db.query(`
      SELECT status, count(*)::int AS count FROM orders GROUP BY status
    `),
    db.query(`
      SELECT p.id, p.name, p.slug, p.images[1] AS image,
             sum(oi.qty)::int AS units_sold,
             sum(oi.total_cents) AS revenue_cents
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status NOT IN ('cancelled','refunded')
      GROUP BY p.id ORDER BY units_sold DESC LIMIT 10
    `),
    db.query(`
      SELECT o.id, o.order_number, o.status, o.total_cents, o.created_at,
             u.full_name AS customer_name
      FROM orders o JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC LIMIT 10
    `),
  ]);

  return res.json(envelope({
    revenue: revenue.rows[0],
    orderCounts: Object.fromEntries(orderCounts.rows.map((r: { status: string; count: number }) => [r.status, r.count])),
    topProducts: topProducts.rows,
    recentOrders: recentOrders.rows,
  }));
});

export default r;
