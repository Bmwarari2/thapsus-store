import { Router } from "express";
import { CreateOrderSchema } from "@thapsus/shared";
import { envelope, errorEnvelope, requireAuth } from "../middleware.js";
import * as orders from "../repos/orders.js";
import * as cartRepo from "../repos/cart.js";
import { db } from "../db.js";
import { priceProduct } from "../services/pricing.js";
import { sendOrderConfirmed } from "../services/email.js";
import { estimatedDeliveryRange } from "@thapsus/shared";

const r = Router();

r.use(requireAuth);

r.post("/", async (req, res) => {
  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorEnvelope("validation", "Invalid input", parsed.error.flatten()));
  }
  const { deliveryAddressId, paymentMethod, promotionCode, notes } = parsed.data;

  // Load cart
  const { cartId, items } = await cartRepo.getCartWithItems(req.user!.id);
  if (!items.length) {
    return res.status(400).json(errorEnvelope("empty_cart", "Your cart is empty"));
  }

  // Validate delivery address belongs to user
  const { rows: addrRows } = await db.query(
    `SELECT * FROM delivery_addresses WHERE id = $1 AND user_id = $2`,
    [deliveryAddressId, req.user!.id],
  );
  if (!addrRows.length) {
    return res.status(404).json(errorEnvelope("not_found", "Delivery address not found"));
  }
  const address = addrRows[0];

  // Re-validate prices and check for stale snapshots (warn if >5% drift)
  const priceWarnings: string[] = [];
  const orderItems = items.map((item) => {
    const current = item.currentPriceCents ?? item.priceSnapshotCents;
    const drift = Math.abs(current - item.priceSnapshotCents) / item.priceSnapshotCents;
    if (drift > 0.05) {
      priceWarnings.push(`${item.productName}: price changed from KES ${Math.round(item.priceSnapshotCents / 100)} to KES ${Math.round(current / 100)}`);
    }
    return {
      productId: item.productId,
      variantId: item.variantId ?? undefined,
      productNameSnap: item.productName ?? "Product",
      productImageSnap: item.productImage,
      variantAttrsSnap: item.variantAttributes ?? undefined,
      qty: item.qty,
      unitPriceCents: current, // always use current price at order time
    };
  });

  // Calculate totals
  const subtotalCents = orderItems.reduce((s, i) => s + i.unitPriceCents * i.qty, 0);

  // Shipping: use the highest estimate across items (single shipment)
  const { rows: shippingRateRows } = await db.query(
    `SELECT fee_kes_cents FROM shipping_rates WHERE is_active = true AND $1 >= weight_min_g AND $1 <= weight_max_g LIMIT 1`,
    [500], // default weight; worker will update per-product weight
  );
  const shippingCents = Number(shippingRateRows[0]?.fee_kes_cents ?? 80000);

  // Tax is already baked into sell_price_kes_cents, so tax_cents here is 0
  const taxCents = 0;

  // Promotion
  let discountCents = 0;
  let promotionId: string | undefined;
  if (promotionCode) {
    const { rows: promoRows } = await db.query(
      `SELECT id, type, value, min_order_cents FROM promotions
       WHERE upper(code) = upper($1) AND is_active = true
         AND valid_from <= now() AND valid_to >= now()
         AND (max_uses IS NULL OR use_count < max_uses)`,
      [promotionCode],
    );
    if (promoRows.length) {
      const promo = promoRows[0];
      if (subtotalCents >= Number(promo.min_order_cents)) {
        discountCents = promo.type === "percentage"
          ? Math.round(subtotalCents * Number(promo.value) / 10000)
          : Number(promo.value);
        promotionId = promo.id;
        await db.query(`UPDATE promotions SET use_count = use_count + 1 WHERE id = $1`, [promo.id]);
      }
    }
  }

  const totalCents = subtotalCents + shippingCents + taxCents - discountCents;

  // Estimated delivery
  const estimatedDeliveryAt = new Date();
  estimatedDeliveryAt.setDate(estimatedDeliveryAt.getDate() + 10); // median 10 days
  const deliveryRange = estimatedDeliveryRange(new Date(), 7, 14);

  const order = await orders.create({
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
    subtotalCents,
    shippingCents,
    taxCents,
    discountCents,
    totalCents,
    paymentMethod,
    promotionId,
    notes,
    items: orderItems,
  });

  // Clear cart
  await cartRepo.clearCart(req.user!.id);

  // Send confirmation email (fire-and-forget)
  const { rows: userRows } = await db.query(`SELECT email FROM users WHERE id = $1`, [req.user!.id]);
  sendOrderConfirmed(userRows[0].email, {
    orderNumber: order.orderNumber,
    totalCents: order.totalCents,
    estimatedDelivery: deliveryRange,
    items: orderItems.map((i) => ({ name: i.productNameSnap, qty: i.qty, priceCents: i.unitPriceCents })),
  }).catch((err) => console.error("[orders] confirmation email failed:", err));

  return res.status(201).json(envelope({ order, priceWarnings }));
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
