import { Router } from "express";
import { envelope, errorEnvelope } from "../middleware.js";
import * as products from "../repos/products.js";
import * as reviews from "../repos/reviews.js";
import { db } from "../db.js";

const r = Router();

const FEED_SORTS = new Set(["newest", "popular", "price_asc", "price_desc", "recommended"]);
const LIST_SORTS = new Set(["newest", "popular", "price_asc", "price_desc", "rating"]);

/**
 * Cursor-fed catalog feed for infinite scroll. No total count, stable under
 * concurrent imports. `cursor` is opaque — pass back `nextCursor` verbatim.
 */
r.get("/feed", async (req, res) => {
  const { category, q, min_price, max_price, sort, limit, cursor, seed } = req.query as Record<string, string>;

  const result = await products.feed({
    categorySlug: category || undefined,
    search: q || undefined,
    minPriceCents: min_price ? Number(min_price) * 100 : undefined,
    maxPriceCents: max_price ? Number(max_price) * 100 : undefined,
    sort: (FEED_SORTS.has(sort) ? sort : "newest") as products.FeedSort,
    limit: Math.min(Math.max(Number(limit) || 24, 1), 48),
    cursor: cursor || undefined,
    seed: seed?.slice(0, 64) || undefined,
  });

  return res.json(envelope({
    items: result.products.map(products.toPublicProduct),
    nextCursor: result.nextCursor,
  }));
});

/**
 * "You may also like" feed for a product page: same category (falling back to
 * the whole catalogue), recommended ordering seeded by the product id so the
 * list is stable while the customer scrolls, the product itself excluded.
 */
r.get("/:slug/related", async (req, res) => {
  const { cursor, limit } = req.query as Record<string, string>;
  const { rows } = await db.query(
    `SELECT p.id, c.slug AS category_slug
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.slug = $1 AND p.is_active = true`,
    [req.params.slug],
  );
  if (!rows[0]) return res.status(404).json(errorEnvelope("not_found", "Product not found"));

  const result = await products.feed({
    categorySlug: (rows[0].category_slug as string | null) ?? undefined,
    sort: "recommended",
    seed: rows[0].id as string,
    excludeId: rows[0].id as string,
    limit: Math.min(Math.max(Number(limit) || 12, 1), 48),
    cursor: cursor || undefined,
  });

  return res.json(envelope({
    items: result.products.map(products.toPublicProduct),
    nextCursor: result.nextCursor,
  }));
});

r.get("/", async (req, res) => {
  const {
    category, q, min_price, max_price, min_rating,
    featured, sort, page, limit,
  } = req.query as Record<string, string>;

  const result = await products.list({
    categorySlug: category,
    search: q,
    minPriceCents: min_price ? Number(min_price) * 100 : undefined,
    maxPriceCents: max_price ? Number(max_price) * 100 : undefined,
    minRating: min_rating ? Number(min_rating) : undefined,
    featured: featured === "true",
    sort: (LIST_SORTS.has(sort) ? sort : "newest") as products.ListProductsOptions["sort"],
    page: page ? Number(page) : 1,
    limit: Math.min(Number(limit ?? 24), 96),
  });

  return res.json(envelope({
    products: result.products.map(products.toPublicProduct),
    total: result.total,
  }));
});

r.get("/featured", async (_req, res) => {
  const result = await products.list({ featured: true, limit: 12, sort: "popular" });
  return res.json(envelope(result.products.map(products.toPublicProduct)));
});

r.get("/categories", async (_req, res) => {
  const cats = await products.getCategories();
  return res.json(envelope(cats));
});

r.get("/:slug", async (req, res) => {
  const product = await products.findBySlug(req.params.slug);
  if (!product) return res.status(404).json(errorEnvelope("not_found", "Product not found"));

  const variants = product.hasVariants ? await products.getVariants(product.id) : [];
  const { reviews: latestReviews, avgRating, total: reviewTotal } = await reviews.listByProduct(product.id, { limit: 5 });
  const distribution = await reviews.getRatingDistribution(product.id);

  // Self-heal stale listings: queue a deduped refresh when the source data is
  // over a day old. Fire-and-forget — never blocks the response.
  maybeEnqueueRefresh(product).catch(() => null);

  return res.json(
    envelope({
      product: products.toPublicProduct(product),
      variants,
      reviews: { items: latestReviews, total: reviewTotal, avgRating, distribution },
    }),
  );
});

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

async function maybeEnqueueRefresh(product: products.Product): Promise<void> {
  if (!product.sourceUrl || product.sourcePlatform === "manual" || product.sourcePlatform === "alibaba") return;
  const scrapedAt = product.lastScrapedAt ? new Date(product.lastScrapedAt).getTime() : 0;
  if (Date.now() - scrapedAt < STALE_AFTER_MS) return;
  try {
    const { getImportQueue } = await import("../queue.js");
    // jobId dedupes: at most one pending refresh per product.
    await getImportQueue().add(
      "refresh-product",
      { productId: product.id },
      { jobId: `refresh-${product.id}`, removeOnComplete: true, removeOnFail: true },
    );
    // Bump last_scraped_at optimistically so a traffic spike doesn't enqueue
    // (and the worker doesn't re-process) the same product repeatedly even
    // after the jobId is cleaned up.
    await db.query(`UPDATE products SET last_scraped_at = now() WHERE id = $1`, [product.id]);
  } catch {
    // Redis unavailable — skip silently; the product still renders.
  }
}

r.get("/:id/reviews", async (req, res) => {
  const { page, limit, min_rating } = req.query as Record<string, string>;
  const result = await reviews.listByProduct(req.params.id, {
    page: Number(page ?? 1),
    limit: Math.min(Number(limit ?? 10), 50),
    minRating: min_rating ? Number(min_rating) : undefined,
  });
  return res.json(envelope(result));
});

export default r;
