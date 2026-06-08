import { Router } from "express";
import { DeliveryAddressSchema } from "@thapsus/shared";
import { envelope, errorEnvelope, requireAuth } from "../middleware.js";
import * as users from "../repos/users.js";
import { db } from "../db.js";

const r = Router();

r.use(requireAuth);

// ── Profile ───────────────────────────────────────────────────────────────────

r.get("/profile", async (req, res) => {
  const user = await users.findById(req.user!.id);
  if (!user) return res.status(404).json(errorEnvelope("not_found", "User not found"));
  return res.json(envelope(user));
});

r.patch("/profile", async (req, res) => {
  const { fullName, phone, marketingConsent, avatarUrl } = req.body ?? {};
  const user = await users.updateProfile(req.user!.id, { fullName, phone, marketingConsent, avatarUrl });
  if (!user) return res.status(404).json(errorEnvelope("not_found", "User not found"));
  return res.json(envelope(user));
});

// ── Delivery Addresses ────────────────────────────────────────────────────────

r.get("/addresses", async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM delivery_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
    [req.user!.id],
  );
  return res.json(envelope(rows));
});

r.post("/addresses", async (req, res) => {
  const parsed = DeliveryAddressSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorEnvelope("validation", "Invalid address", parsed.error.flatten()));
  }
  const d = parsed.data;

  // If setting as default, unset existing default first
  if (d.isDefault) {
    await db.query(
      `UPDATE delivery_addresses SET is_default = false WHERE user_id = $1`,
      [req.user!.id],
    );
  }

  const { rows } = await db.query(
    `INSERT INTO delivery_addresses (user_id, label, full_name, phone, county, town, address_line, is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user!.id, d.label, d.fullName, d.phone, d.county, d.town, d.addressLine, d.isDefault],
  );
  return res.status(201).json(envelope(rows[0]));
});

r.put("/addresses/:id", async (req, res) => {
  const parsed = DeliveryAddressSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorEnvelope("validation", "Invalid address", parsed.error.flatten()));
  }
  const d = parsed.data;

  if (d.isDefault) {
    await db.query(`UPDATE delivery_addresses SET is_default = false WHERE user_id = $1`, [req.user!.id]);
  }

  const { rows } = await db.query(
    `UPDATE delivery_addresses
     SET label=$2, full_name=$3, phone=$4, county=$5, town=$6, address_line=$7, is_default=$8
     WHERE id=$1 AND user_id=$9
     RETURNING *`,
    [req.params.id, d.label, d.fullName, d.phone, d.county, d.town, d.addressLine, d.isDefault, req.user!.id],
  );
  if (!rows[0]) return res.status(404).json(errorEnvelope("not_found", "Address not found"));
  return res.json(envelope(rows[0]));
});

r.delete("/addresses/:id", async (req, res) => {
  const { rowCount } = await db.query(
    `DELETE FROM delivery_addresses WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user!.id],
  );
  if (!rowCount) return res.status(404).json(errorEnvelope("not_found", "Address not found"));
  return res.json(envelope({ deleted: true }));
});

// ── Wishlist ──────────────────────────────────────────────────────────────────

r.get("/wishlist", async (req, res) => {
  const { rows } = await db.query(
    `SELECT wi.id, wi.created_at,
            p.id AS product_id, p.name, p.slug, p.images[1] AS image,
            p.sell_price_kes_cents, p.rating, p.review_count, p.stock_status
     FROM wishlist_items wi
     JOIN products p ON p.id = wi.product_id
     WHERE wi.user_id = $1
     ORDER BY wi.created_at DESC`,
    [req.user!.id],
  );
  return res.json(envelope(rows));
});

r.post("/wishlist", async (req, res) => {
  const productId = String(req.body?.productId ?? "");
  if (!productId) return res.status(400).json(errorEnvelope("validation", "productId required"));

  await db.query(
    `INSERT INTO wishlist_items (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.user!.id, productId],
  );
  return res.status(201).json(envelope({ added: true }));
});

r.delete("/wishlist/:productId", async (req, res) => {
  await db.query(
    `DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2`,
    [req.user!.id, req.params.productId],
  );
  return res.json(envelope({ removed: true }));
});

// ── Notifications ─────────────────────────────────────────────────────────────

r.get("/notifications", async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user!.id],
  );
  return res.json(envelope(rows));
});

r.post("/notifications/:id/read", async (req, res) => {
  await db.query(
    `UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user!.id],
  );
  return res.json(envelope({ read: true }));
});

r.post("/notifications/read-all", async (req, res) => {
  await db.query(
    `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
    [req.user!.id],
  );
  return res.json(envelope({ read: true }));
});

// ── Support Tickets ───────────────────────────────────────────────────────────

r.get("/support", async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.*, array_agg(json_build_object('body', tm.body, 'created_at', tm.created_at) ORDER BY tm.created_at) AS messages
     FROM tickets t
     LEFT JOIN ticket_messages tm ON tm.ticket_id = t.id
     WHERE t.user_id = $1
     GROUP BY t.id
     ORDER BY t.updated_at DESC`,
    [req.user!.id],
  );
  return res.json(envelope(rows));
});

r.post("/support", async (req, res) => {
  const subject = String(req.body?.subject ?? "").trim();
  const body = String(req.body?.body ?? "").trim();
  const orderId = req.body?.orderId ?? null;
  if (!subject || !body) {
    return res.status(400).json(errorEnvelope("validation", "Subject and body required"));
  }

  const { rows: [ticket] } = await db.query(
    `INSERT INTO tickets (user_id, order_id, subject) VALUES ($1,$2,$3) RETURNING *`,
    [req.user!.id, orderId, subject],
  );
  await db.query(
    `INSERT INTO ticket_messages (ticket_id, author_id, body) VALUES ($1,$2,$3)`,
    [ticket.id, req.user!.id, body],
  );
  return res.status(201).json(envelope(ticket));
});

r.post("/support/:id/reply", async (req, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (!body) return res.status(400).json(errorEnvelope("validation", "Reply body required"));

  // Verify ticket belongs to user
  const { rows } = await db.query(
    `SELECT id FROM tickets WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user!.id],
  );
  if (!rows.length) return res.status(404).json(errorEnvelope("not_found", "Ticket not found"));

  await db.query(
    `INSERT INTO ticket_messages (ticket_id, author_id, body) VALUES ($1,$2,$3)`,
    [req.params.id, req.user!.id, body],
  );
  await db.query(`UPDATE tickets SET updated_at = now() WHERE id = $1`, [req.params.id]);
  return res.json(envelope({ replied: true }));
});

export default r;
