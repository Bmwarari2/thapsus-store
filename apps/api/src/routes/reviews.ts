import { Router } from "express";
import { CreateReviewSchema } from "@thapsus/shared";
import { envelope, errorEnvelope, requireAuth } from "../middleware.js";
import * as reviews from "../repos/reviews.js";
import * as products from "../repos/products.js";

const r = Router();

r.post("/", requireAuth, async (req, res) => {
  const parsed = CreateReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorEnvelope("validation", "Invalid input", parsed.error.flatten()));
  }
  const { orderItemId, rating, title, body, images } = parsed.data;

  // Derive productId from the order item
  const { db } = await import("../db.js");
  const { rows } = await db.query(`SELECT product_id FROM order_items WHERE id = $1`, [orderItemId]);
  if (!rows[0]) return res.status(404).json(errorEnvelope("not_found", "Order item not found"));

  const review = await reviews.create({
    userId: req.user!.id,
    productId: rows[0].product_id,
    orderItemId,
    rating,
    title,
    body,
    images,
  });

  // Update product rating cache asynchronously
  products.updateRatingCache(rows[0].product_id).catch(() => null);

  return res.status(201).json(envelope(review));
});

r.post("/:id/helpful", requireAuth, async (req, res) => {
  await reviews.markHelpful(req.params.id, req.user!.id);
  return res.json(envelope({ marked: true }));
});

// Pending reviews for the logged-in customer (items they can review)
r.get("/pending", requireAuth, async (req, res) => {
  const { db } = await import("../db.js");
  const { rows } = await db.query(
    `SELECT oi.id AS order_item_id, oi.product_name_snap, oi.product_image_snap,
            oi.product_id, o.order_number, o.delivered_at
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.user_id = $1
       AND o.status = 'delivered'
       AND NOT EXISTS (
         SELECT 1 FROM reviews r WHERE r.order_item_id = oi.id AND r.user_id = $1
       )
     ORDER BY o.delivered_at DESC`,
    [req.user!.id],
  );
  return res.json(envelope(rows));
});

export default r;
