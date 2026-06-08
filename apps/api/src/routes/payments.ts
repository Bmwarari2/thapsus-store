/**
 * M-Pesa Lipana (Lipa Na M-Pesa) payment routes.
 * The STK push and OAuth token logic already exists in the business.
 * This file wires the callback into the order lifecycle.
 */

import { Router } from "express";
import { envelope, errorEnvelope } from "../middleware.js";
import * as orders from "../repos/orders.js";
import { sendOrderConfirmed } from "../services/email.js";
import { db } from "../db.js";

const r = Router();

/**
 * M-Pesa Lipana callback — called by Safaricom after STK push completes.
 * Must be publicly accessible (no auth middleware).
 * URL set in MPESA_CALLBACK_URL env var.
 */
r.post("/mpesa/callback", async (req, res) => {
  const body = req.body?.Body?.stkCallback;
  if (!body) {
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const { ResultCode, MerchantRequestID, CheckoutRequestID, CallbackMetadata } = body;

  if (ResultCode !== 0) {
    // Payment was cancelled or failed — leave order in pending_payment
    console.log(`[mpesa] payment failed: ${ResultCode} — ${body.ResultDesc}`);
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  // Extract values from CallbackMetadata
  const meta: Record<string, string | number> = {};
  for (const item of CallbackMetadata?.Item ?? []) {
    meta[item.Name] = item.Value;
  }

  const mpesaRef = String(meta.MpesaReceiptNumber ?? "");
  const amount = Number(meta.Amount ?? 0);
  const phone = String(meta.PhoneNumber ?? "");

  // Match to order via CheckoutRequestID stored during STK push initiation
  const { rows } = await db.query(
    `SELECT id, user_id, order_number, total_cents FROM orders
     WHERE payment_ref = $1 AND status = 'pending_payment'`,
    [CheckoutRequestID],
  );

  if (!rows[0]) {
    console.warn(`[mpesa] no pending order for CheckoutRequestID ${CheckoutRequestID}`);
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const order = rows[0];
  await orders.updateStatus(order.id, "payment_confirmed", {
    paymentRef: mpesaRef,
    paidAt: new Date().toISOString(),
  });

  // Log transaction
  await db.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, 'payment_confirmed', 'Payment Received', $2, $3)`,
    [
      order.user_id,
      `Payment of KES ${Math.round(Number(order.total_cents) / 100).toLocaleString()} confirmed.`,
      JSON.stringify({ order_id: order.id, mpesa_ref: mpesaRef }),
    ],
  );

  console.log(`[mpesa] payment confirmed: ${mpesaRef} for order ${order.order_number}`);
  return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

/**
 * Initiate M-Pesa STK push for an order.
 * Stores CheckoutRequestID as payment_ref so the callback can match it.
 */
r.post("/mpesa/initiate", async (req, res) => {
  const { orderId, phone } = req.body ?? {};
  if (!orderId || !phone) {
    return res.status(400).json(errorEnvelope("validation", "orderId and phone required"));
  }

  const order = await orders.findById(orderId);
  if (!order) return res.status(404).json(errorEnvelope("not_found", "Order not found"));
  if (order.status !== "pending_payment") {
    return res.status(400).json(errorEnvelope("already_paid", "Order is not awaiting payment"));
  }

  // Get M-Pesa OAuth token
  const tokenRes = await fetch(
    "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`,
        ).toString("base64")}`,
      },
    },
  );
  const { access_token } = await tokenRes.json() as { access_token: string };

  // Build STK push request
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const password = Buffer.from(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`,
  ).toString("base64");

  const stkRes = await fetch(
    "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.ceil(order.totalCents / 100),
        PartyA: phone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: process.env.MPESA_CALLBACK_URL,
        AccountReference: order.orderNumber,
        TransactionDesc: `Thapsus order ${order.orderNumber}`,
      }),
    },
  );
  const stkData = await stkRes.json() as { CheckoutRequestID?: string; errorCode?: string };

  if (!stkData.CheckoutRequestID) {
    return res.status(502).json(errorEnvelope("mpesa_error", "STK push failed", stkData));
  }

  // Store CheckoutRequestID so callback can match it
  await db.query(
    `UPDATE orders SET payment_ref = $2 WHERE id = $1`,
    [order.id, stkData.CheckoutRequestID],
  );

  return res.json(envelope({ checkoutRequestId: stkData.CheckoutRequestID }));
});

export default r;
