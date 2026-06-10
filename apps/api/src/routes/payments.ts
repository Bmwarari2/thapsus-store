/**
 * M-Pesa (Lipa Na M-Pesa) payment routes.
 *
 * Security model:
 *   • /mpesa/initiate is authenticated and owner-checked; phone numbers are
 *     normalized to 2547XXXXXXXX before hitting Daraja.
 *   • The callback lives behind a secret path token (MPESA_CALLBACK_TOKEN) —
 *     Daraja sends no signature, so the unguessable URL is the first gate.
 *   • A success callback is never trusted on its own: the paid Amount must
 *     match the order total AND an STK Push status query against Daraja must
 *     confirm the transaction before the order flips to payment_confirmed.
 *   • The cart is cleared and the promotion counted only on confirmed payment.
 */

import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { InitiateMpesaSchema, normalizeKenyanPhone } from "@thapsus/shared";
import { envelope, errorEnvelope, requireAuth } from "../middleware.js";
import * as orders from "../repos/orders.js";
import * as cartRepo from "../repos/cart.js";
import { sendOrderConfirmed } from "../services/email.js";
import { db } from "../db.js";

const r = Router();

const DARAJA_BASE = process.env.MPESA_ENV === "sandbox"
  ? "https://sandbox.safaricom.co.ke"
  : "https://api.safaricom.co.ke";

function darajaCredentials(): { password: string; timestamp: string } {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const password = Buffer.from(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`,
  ).toString("base64");
  return { password, timestamp };
}

async function darajaToken(): Promise<string> {
  const res = await fetch(`${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`,
      ).toString("base64")}`,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Daraja OAuth failed: HTTP ${res.status}`);
  const { access_token } = await res.json() as { access_token?: string };
  if (!access_token) throw new Error("Daraja OAuth returned no token");
  return access_token;
}

/** Query Daraja for the authoritative result of an STK push. */
async function stkPushQuery(checkoutRequestId: string): Promise<{ confirmed: boolean; resultCode?: string }> {
  const token = await darajaToken();
  const { password, timestamp } = darajaCredentials();
  const res = await fetch(`${DARAJA_BASE}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json() as { ResultCode?: string | number };
  const resultCode = data.ResultCode != null ? String(data.ResultCode) : undefined;
  return { confirmed: resultCode === "0", resultCode };
}

async function logPaymentAnomaly(action: string, orderId: string, meta: Record<string, unknown>): Promise<void> {
  await db.query(
    `INSERT INTO admin_logs (actor_id, action, entity, entity_id, meta)
     VALUES (NULL, $1, 'order', $2, $3)`,
    [action, orderId, JSON.stringify(meta)],
  ).catch((err) => console.error("[mpesa] failed to log anomaly:", err));
}

/**
 * Single place an order becomes paid. Idempotent — a second call for an
 * already-paid order is a no-op. Clears the cart, consumes the promotion,
 * notifies, and emails.
 */
async function markOrderPaid(orderId: string, paymentRef: string): Promise<void> {
  const { rows } = await db.query(
    `UPDATE orders
     SET status = 'payment_confirmed', payment_ref = $2, paid_at = now(), updated_at = now()
     WHERE id = $1 AND paid_at IS NULL
     RETURNING id, user_id, order_number, total_cents, promotion_id, estimated_delivery_at`,
    [orderId, paymentRef],
  );
  const order = rows[0];
  if (!order) return; // already processed

  await cartRepo.clearCart(order.user_id);

  if (order.promotion_id) {
    await db.query(`UPDATE promotions SET use_count = use_count + 1 WHERE id = $1`, [order.promotion_id]);
  }

  await db.query(
    `UPDATE products p SET order_count = p.order_count + oi.qty
     FROM order_items oi WHERE oi.order_id = $1 AND oi.product_id = p.id`,
    [orderId],
  );

  await db.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, 'payment_confirmed', 'Payment Received', $2, $3)`,
    [
      order.user_id,
      `Payment of KES ${Math.round(Number(order.total_cents) / 100).toLocaleString()} confirmed for order ${order.order_number}.`,
      JSON.stringify({ order_id: order.id, mpesa_ref: paymentRef }),
    ],
  );

  const [{ rows: userRows }, items] = await Promise.all([
    db.query(`SELECT email FROM users WHERE id = $1`, [order.user_id]),
    orders.getItems(order.id),
  ]);
  if (userRows[0]?.email) {
    const eta = order.estimated_delivery_at
      ? new Date(order.estimated_delivery_at).toLocaleDateString("en-KE", { month: "short", day: "numeric" })
      : "7–14 business days";
    sendOrderConfirmed(userRows[0].email, {
      orderNumber: order.order_number,
      totalCents: Number(order.total_cents),
      estimatedDelivery: eta,
      items: items.map((i) => ({ name: i.productNameSnap, qty: i.qty, priceCents: i.unitPriceCents })),
    }).catch((err) => console.error("[mpesa] confirmation email failed:", err));
  }

  console.log(`[mpesa] payment confirmed: ${paymentRef} for order ${order.order_number}`);
}

function callbackTokenValid(provided: string): boolean {
  const expected = process.env.MPESA_CALLBACK_TOKEN ?? "";
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * M-Pesa callback — public endpoint, guarded by the secret path token.
 * Always answers ResultCode 0 so Daraja stops retrying; order state only
 * changes after amount + STK-query verification.
 */
r.post("/mpesa/callback/:token", async (req, res) => {
  if (!callbackTokenValid(req.params.token)) {
    return res.status(404).json(errorEnvelope("not_found", "Not found"));
  }

  const body = req.body?.Body?.stkCallback;
  if (!body) {
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const { ResultCode, CheckoutRequestID, CallbackMetadata } = body;

  if (ResultCode !== 0) {
    // Payment cancelled or failed — leave order in pending_payment.
    console.log(`[mpesa] payment failed: ${ResultCode} — ${body.ResultDesc}`);
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const meta: Record<string, string | number> = {};
  for (const item of CallbackMetadata?.Item ?? []) {
    meta[item.Name] = item.Value;
  }
  const mpesaRef = String(meta.MpesaReceiptNumber ?? "");
  const paidAmount = Number(meta.Amount ?? 0);

  const { rows } = await db.query(
    `SELECT id, total_cents, paid_at FROM orders WHERE mpesa_checkout_request_id = $1`,
    [CheckoutRequestID],
  );
  const order = rows[0];
  if (!order) {
    console.warn(`[mpesa] no order for CheckoutRequestID ${CheckoutRequestID}`);
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
  if (order.paid_at) {
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" }); // replay — already settled
  }

  // Gate 1: the paid amount must match the order total.
  const expectedAmount = Math.ceil(Number(order.total_cents) / 100);
  if (paidAmount !== expectedAmount) {
    await logPaymentAnomaly("mpesa_amount_mismatch", order.id, {
      expected: expectedAmount, paid: paidAmount, mpesa_ref: mpesaRef, checkout_request_id: CheckoutRequestID,
    });
    console.error(`[mpesa] AMOUNT MISMATCH on order ${order.id}: expected ${expectedAmount}, callback says ${paidAmount}`);
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  // Gate 2: confirm against Daraja itself — callbacks can be forged.
  try {
    const query = await stkPushQuery(CheckoutRequestID);
    if (!query.confirmed) {
      await logPaymentAnomaly("mpesa_query_unconfirmed", order.id, {
        result_code: query.resultCode, mpesa_ref: mpesaRef, checkout_request_id: CheckoutRequestID,
      });
      console.error(`[mpesa] STK query did NOT confirm payment for order ${order.id} (ResultCode ${query.resultCode})`);
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }
  } catch (err) {
    // Daraja unreachable: leave the order pending for admin reconciliation
    // rather than trusting an unverifiable callback.
    await logPaymentAnomaly("mpesa_query_failed", order.id, {
      error: err instanceof Error ? err.message : String(err),
      mpesa_ref: mpesaRef, checkout_request_id: CheckoutRequestID,
    });
    console.error(`[mpesa] STK query failed for order ${order.id}:`, err);
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  await markOrderPaid(order.id, mpesaRef);
  return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

/**
 * Initiate an STK push for one of the caller's own pending orders.
 */
r.post("/mpesa/initiate", requireAuth, async (req, res) => {
  const parsed = InitiateMpesaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorEnvelope("validation", "Invalid input", parsed.error.flatten()));
  }

  const phone = normalizeKenyanPhone(parsed.data.phone);
  if (!phone) {
    return res.status(400).json(errorEnvelope("invalid_phone", "Enter a valid Kenyan mobile number (07XX… or 2547XX…)"));
  }

  const order = await orders.findById(parsed.data.orderId, req.user!.id);
  if (!order) return res.status(404).json(errorEnvelope("not_found", "Order not found"));
  if (order.status !== "pending_payment") {
    return res.status(400).json(errorEnvelope("already_paid", "Order is not awaiting payment"));
  }

  const token = await darajaToken();
  const { password, timestamp } = darajaCredentials();
  const callbackUrl = `${process.env.MPESA_CALLBACK_URL}/${process.env.MPESA_CALLBACK_TOKEN}`;

  const stkRes = await fetch(`${DARAJA_BASE}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.ceil(order.totalCents / 100),
      PartyA: phone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: order.orderNumber,
      TransactionDesc: `Thapsus order ${order.orderNumber}`,
    }),
  });
  const stkData = await stkRes.json() as { CheckoutRequestID?: string; errorCode?: string; errorMessage?: string };

  if (!stkData.CheckoutRequestID) {
    console.error("[mpesa] STK push failed:", stkData.errorCode, stkData.errorMessage);
    return res.status(502).json(errorEnvelope("mpesa_error", "Could not send the M-Pesa prompt. Please try again."));
  }

  await db.query(
    `UPDATE orders SET mpesa_checkout_request_id = $2, updated_at = now() WHERE id = $1`,
    [order.id, stkData.CheckoutRequestID],
  );

  return res.json(envelope({ checkoutRequestId: stkData.CheckoutRequestID }));
});

export default r;
