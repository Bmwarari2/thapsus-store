/**
 * Checkout: quote → order → pay.
 *
 *   POST /orders/quote  — server-prices the cart: live item prices, delivery
 *                         from real cart weight, promotion validated (not
 *                         consumed). Persists an order_quotes row (30-min TTL).
 *   POST /orders        — replays an unexpired quote into an order. Idempotent
 *                         via the Idempotency-Key header and the quote linkage.
 *                         Does NOT clear the cart or burn the promotion — that
 *                         happens when payment confirms.
 *   GET  /orders/:id/payment-status — client polling during the STK push.
 */

import { Router } from "express";
import { CreateOrderSchema, CreateQuoteSchema, computeCartCharges, estimatedDeliveryRange } from "@thapsus/shared";
import { envelope, errorEnvelope, requireAuth } from "../middleware.js";
import * as orders from "../repos/orders.js";
import { db } from "../db.js";
import { loadPricingConfig } from "../services/pricing.js";
import { deliveryFeeForWeight } from "../services/shipping.js";

const r = Router();

r.use(requireAuth);

const QUOTE_TTL_MINUTES = 30;
const MAX_DRIFT = 0.02; // order rejected if any line price moved >2% since the quote

interface QuoteLine {
  productId: string;
  variantId: string | null;
  qty: number;
  unitPriceCents: number;
  weightGrams: number;
  nameSnap: string;
  imageSnap: string | null;
  attrsSnap: Record<string, string> | null;
}

r.post("/quote", async (req, res) => {
  const parsed = CreateQuoteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(errorEnvelope("validation", "Invalid input", parsed.error.flatten()));
  }

  // Cart lines with live product price, weight, and stock.
  const { rows } = await db.query(
    `SELECT ci.product_id, ci.variant_id, ci.qty,
            p.name, p.images[1] AS image, p.weight_grams, p.stock_status,
            p.is_active, p.sell_price_kes_cents,
            pv.attributes AS variant_attributes, pv.price_delta_kes_cents,
            pv.stock_qty AS variant_stock, pv.is_active AS variant_active
     FROM cart_items ci
     JOIN carts c        ON c.id = ci.cart_id AND c.user_id = $1
     JOIN products p     ON p.id = ci.product_id
     LEFT JOIN product_variants pv ON pv.id = ci.variant_id
     ORDER BY ci.added_at`,
    [req.user!.id],
  );
  if (!rows.length) {
    return res.status(400).json(errorEnvelope("empty_cart", "Your cart is empty"));
  }

  const warnings: string[] = [];
  const lines: QuoteLine[] = [];

  for (const row of rows) {
    const unavailable =
      !row.is_active ||
      row.stock_status === "out_of_stock" ||
      (row.variant_id && (!row.variant_active || Number(row.variant_stock) <= 0));
    if (unavailable) {
      warnings.push(`${row.name} is currently unavailable and was left out of this order.`);
      continue;
    }
    lines.push({
      productId: row.product_id,
      variantId: row.variant_id ?? null,
      qty: Number(row.qty),
      unitPriceCents: Number(row.sell_price_kes_cents) + Number(row.price_delta_kes_cents ?? 0),
      weightGrams: Number(row.weight_grams),
      nameSnap: row.name,
      imageSnap: row.image ?? null,
      attrsSnap: row.variant_attributes ?? null,
    });
  }

  if (!lines.length) {
    return res.status(400).json(errorEnvelope("nothing_available", "No items in your cart are currently available", { warnings }));
  }

  const itemsCents = lines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0);
  const totalWeightGrams = lines.reduce((s, l) => s + l.weightGrams * l.qty, 0);
  const delivery = await deliveryFeeForWeight(totalWeightGrams);

  // Promotion: validated here, consumed only when payment confirms.
  let discountCents = 0;
  let promotionId: string | null = null;
  if (parsed.data.promotionCode) {
    const { rows: promoRows } = await db.query(
      `SELECT id, type, value, min_order_cents FROM promotions
       WHERE upper(code) = upper($1) AND is_active = true
         AND valid_from <= now() AND valid_to >= now()
         AND (max_uses IS NULL OR use_count < max_uses)`,
      [parsed.data.promotionCode],
    );
    const promo = promoRows[0];
    if (!promo) {
      warnings.push("That promo code is invalid or expired.");
    } else if (itemsCents < Number(promo.min_order_cents)) {
      warnings.push(`Promo code requires a minimum order of KES ${Math.round(Number(promo.min_order_cents) / 100).toLocaleString()}.`);
    } else {
      discountCents = promo.type === "percentage"
        ? Math.round(itemsCents * Number(promo.value) / 10000)
        : Math.min(Number(promo.value), itemsCents);
      promotionId = promo.id;
    }
  }

  const cfg = await loadPricingConfig();
  const charges = computeCartCharges({ itemsCents, deliveryCents: delivery.feeCents, cfg, discountCents });

  const expiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000);
  const { rows: [quote] } = await db.query(
    `INSERT INTO order_quotes (
       user_id, items, items_cents, delivery_cents, duty_cents, vat_cents,
       discount_cents, total_cents, promotion_id, fx_usd, fx_gbp, expires_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id, expires_at`,
    [
      req.user!.id,
      JSON.stringify(lines),
      itemsCents,
      delivery.feeCents,
      charges.dutyCents,
      charges.vatCents,
      discountCents,
      charges.totalCents,
      promotionId,
      cfg.usdToKesRate,
      cfg.gbpToKesRate,
      expiresAt.toISOString(),
    ],
  );

  return res.status(201).json(envelope({
    quoteId: quote.id,
    expiresAt: quote.expires_at,
    lines,
    itemsCents,
    deliveryCents: delivery.feeCents,
    dutyCents: charges.dutyCents,
    vatCents: charges.vatCents,
    discountCents,
    totalCents: charges.totalCents,
    totalWeightGrams,
    estimatedDelivery: estimatedDeliveryRange(new Date(), delivery.estDaysMin, delivery.estDaysMax),
    estDaysMin: delivery.estDaysMin,
    estDaysMax: delivery.estDaysMax,
    warnings,
  }));
});

r.post("/", async (req, res) => {
  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorEnvelope("validation", "Invalid input", parsed.error.flatten()));
  }
  const { quoteId, deliveryAddressId, paymentMethod, notes } = parsed.data;

  const { rows: quoteRows } = await db.query(
    `SELECT * FROM order_quotes WHERE id = $1 AND user_id = $2`,
    [quoteId, req.user!.id],
  );
  const quote = quoteRows[0];
  if (!quote) return res.status(404).json(errorEnvelope("not_found", "Quote not found"));

  // A quote already turned into an order → return that order (safe replay).
  const existingForQuote = await orders.findByQuoteId(quoteId);
  if (existingForQuote) return res.status(200).json(envelope({ order: existingForQuote, replayed: true }));

  if (new Date(quote.expires_at).getTime() < Date.now()) {
    return res.status(409).json(errorEnvelope("quote_expired", "This quote has expired — please review your order again"));
  }

  const lines = quote.items as QuoteLine[];

  // Re-check price drift: if the catalog moved more than 2% on any line since
  // the quote, force a re-quote rather than charging a stale price.
  const { rows: priceRows } = await db.query(
    `SELECT p.id AS product_id, pv.id AS variant_id,
            p.sell_price_kes_cents + COALESCE(pv.price_delta_kes_cents, 0) AS current_cents
     FROM products p
     LEFT JOIN product_variants pv ON pv.product_id = p.id
     WHERE p.id = ANY($1::uuid[])`,
    [lines.map((l) => l.productId)],
  );
  for (const line of lines) {
    const match = priceRows.find(
      (pr: Record<string, unknown>) =>
        pr.product_id === line.productId && (pr.variant_id ?? null) === (line.variantId ?? null),
    ) ?? priceRows.find((pr: Record<string, unknown>) => pr.product_id === line.productId && pr.variant_id == null);
    if (!match) continue;
    const current = Number(match.current_cents);
    if (line.unitPriceCents > 0 && Math.abs(current - line.unitPriceCents) / line.unitPriceCents > MAX_DRIFT) {
      return res.status(409).json(errorEnvelope("quote_stale", "Prices have changed since this quote — please review your order again"));
    }
  }

  // Delivery address must belong to the user.
  const { rows: addrRows } = await db.query(
    `SELECT * FROM delivery_addresses WHERE id = $1 AND user_id = $2`,
    [deliveryAddressId, req.user!.id],
  );
  if (!addrRows.length) {
    return res.status(404).json(errorEnvelope("not_found", "Delivery address not found"));
  }
  const address = addrRows[0];

  const totalWeightGrams = lines.reduce((s, l) => s + l.weightGrams * l.qty, 0);
  const delivery = await deliveryFeeForWeight(totalWeightGrams);
  const estimatedDeliveryAt = new Date();
  estimatedDeliveryAt.setDate(estimatedDeliveryAt.getDate() + delivery.estDaysMax);

  const { order, replayed } = await orders.create({
    userId: req.user!.id,
    deliveryAddressId,
    deliveryAddressSnap: {
      fullName: address.full_name,
      phone: address.phone,
      county: address.county,
      town: address.town,
      addressLine: address.address_line,
    },
    estimatedDeliveryAt: estimatedDeliveryAt.toISOString().split("T")[0],
    subtotalCents: Number(quote.items_cents),
    shippingCents: Number(quote.delivery_cents),
    taxCents: 0, // legacy column; duty/vat have their own lines now
    dutyCents: Number(quote.duty_cents),
    vatCents: Number(quote.vat_cents),
    discountCents: Number(quote.discount_cents),
    totalCents: Number(quote.total_cents),
    paymentMethod,
    promotionId: quote.promotion_id ?? undefined,
    quoteId,
    idempotencyKey: req.idemKey,
    notes,
    items: lines.map((l) => ({
      productId: l.productId,
      variantId: l.variantId ?? undefined,
      productNameSnap: l.nameSnap,
      productImageSnap: l.imageSnap ?? undefined,
      variantAttrsSnap: l.attrsSnap ?? undefined,
      qty: l.qty,
      unitPriceCents: l.unitPriceCents,
    })),
  });

  // Cart is cleared and the promotion counted when payment confirms — an
  // abandoned STK push must not empty the customer's cart.

  return res.status(replayed ? 200 : 201).json(envelope({ order, replayed }));
});

r.get("/", async (req, res) => {
  const { page } = req.query as Record<string, string>;
  const result = await orders.listByUser(req.user!.id, Number(page ?? 1));
  return res.json(envelope(result));
});

r.get("/:id", async (req, res) => {
  const order = await orders.findById(req.params.id, req.user!.id);
  if (!order) return res.status(404).json(errorEnvelope("not_found", "Order not found"));
  const items = await orders.getItems(order.id);
  return res.json(envelope({ order, items }));
});

r.get("/:id/payment-status", async (req, res) => {
  const order = await orders.findById(req.params.id, req.user!.id);
  if (!order) return res.status(404).json(errorEnvelope("not_found", "Order not found"));
  const status =
    order.paidAt ? "paid"
    : order.status === "cancelled" ? "cancelled"
    : "pending";
  return res.json(envelope({ status, orderStatus: order.status, paidAt: order.paidAt, paymentRef: order.paymentRef }));
});

r.post("/:id/cancel", async (req, res) => {
  const order = await orders.findById(req.params.id, req.user!.id);
  if (!order) return res.status(404).json(errorEnvelope("not_found", "Order not found"));
  if (order.status !== "pending_payment") {
    return res.status(400).json(errorEnvelope("cannot_cancel", "Only unpaid orders can be cancelled"));
  }
  const updated = await orders.updateStatus(order.id, "cancelled");
  return res.json(envelope(updated));
});

export default r;
