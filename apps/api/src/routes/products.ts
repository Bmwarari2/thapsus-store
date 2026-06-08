import { Router } from "express";
import { envelope, errorEnvelope } from "../middleware.js";
import * as products from "../repos/products.js";
import * as reviews from "../repos/reviews.js";

const r = Router();

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
    sort: sort as never,
    page: page ? Number(page) : 1,
    limit: Math.min(Number(limit ?? 24), 96),
  });

  return res.json(envelope(result));
});

r.get("/featured", async (_req, res) => {
  const result = await products.list({ featured: true, limit: 12, sort: "popular" });
  return res.json(envelope(result.products));
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

  return res.json(
    envelope({
      product,
      variants,
      reviews: { items: latestReviews, total: reviewTotal, avgRating, distribution },
    }),
  );
});

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
