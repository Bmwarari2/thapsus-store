/**
 * Email service — Gmail OAuth transport.
 * Uses the existing OAuth2 credentials already configured.
 * All outbound emails are logged to the email_logs table.
 */

import { google } from "googleapis";
import nodemailer from "nodemailer";
import { db } from "../db.js";

function createTransport() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.GMAIL_FROM,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: oauth2Client.getAccessToken() as unknown as string,
    },
  });
}

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  template: string;
  payload?: Record<string, unknown>;
}

export async function sendEmail(opts: SendOptions): Promise<void> {
  const transport = createTransport();
  let status = "sent";
  let providerRef: string | null = null;

  try {
    const info = await transport.sendMail({
      from: `Thapsus Store <${process.env.GMAIL_FROM}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    providerRef = info.messageId ?? null;
  } catch (err) {
    status = "failed";
    console.error("[email] send failed:", err);
    throw err;
  } finally {
    await db.query(
      `INSERT INTO email_logs (to_email, template, subject, status, provider_ref, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [opts.to, opts.template, opts.subject, status, providerRef, JSON.stringify(opts.payload ?? {})],
    ).catch(() => null); // log failure must not throw
  }
}

// ── Email templates ───────────────────────────────────────────────────────────

export async function sendWelcome(to: string, name: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Welcome to Thapsus Store 🎉",
    template: "welcome",
    payload: { name },
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h1 style="color:#E8315B">Welcome, ${name}!</h1>
        <p>Your Thapsus Store account is ready. Browse thousands of products
           from Alibaba, AliExpress, and Shein — shipped directly to you in Kenya.</p>
        <a href="${process.env.WEB_BASE_URL}" style="display:inline-block;background:#E8315B;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
          Start Shopping
        </a>
        <p style="color:#888;margin-top:32px;font-size:13px">
          Delivery in 7–14 business days. One bill — no hidden fees.
        </p>
      </div>`,
  });
}

export async function sendOrderConfirmed(
  to: string,
  data: { orderNumber: string; totalCents: number; estimatedDelivery: string; items: { name: string; qty: number; priceCents: number }[] },
): Promise<void> {
  const itemRows = data.items
    .map((i) => `<tr><td>${i.name}</td><td>x${i.qty}</td><td>KES ${Math.round(i.priceCents / 100).toLocaleString()}</td></tr>`)
    .join("");

  await sendEmail({
    to,
    subject: `Order Confirmed — ${data.orderNumber}`,
    template: "order_confirmed",
    payload: data,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h1 style="color:#E8315B">Order Confirmed ✅</h1>
        <p>Your order <strong>${data.orderNumber}</strong> has been received.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead><tr style="background:#f5f5f5"><th align="left">Item</th><th>Qty</th><th>Price</th></tr></thead>
          <tbody>${itemRows}</tbody>
          <tfoot><tr><td colspan="2"><strong>Total</strong></td>
            <td><strong>KES ${Math.round(data.totalCents / 100).toLocaleString()}</strong></td></tr></tfoot>
        </table>
        <p>📦 Estimated delivery: <strong>${data.estimatedDelivery}</strong></p>
        <a href="${process.env.WEB_BASE_URL}/account/orders" style="display:inline-block;background:#E8315B;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">
          Track Order
        </a>
      </div>`,
  });
}

export async function sendOrderShipped(
  to: string,
  data: { orderNumber: string; trackingNumber: string; estimatedDelivery: string },
): Promise<void> {
  await sendEmail({
    to,
    subject: `Your order ${data.orderNumber} is on its way!`,
    template: "order_shipped",
    payload: data,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h1 style="color:#E8315B">Your Order is Shipped 🚚</h1>
        <p>Order <strong>${data.orderNumber}</strong> is on its way to you.</p>
        <p>Tracking: <strong>${data.trackingNumber}</strong></p>
        <p>Estimated arrival: <strong>${data.estimatedDelivery}</strong></p>
        <a href="${process.env.WEB_BASE_URL}/account/orders" style="display:inline-block;background:#E8315B;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">
          View Order
        </a>
      </div>`,
  });
}

export async function sendOrderDelivered(
  to: string,
  data: { orderNumber: string; orderId: string },
): Promise<void> {
  await sendEmail({
    to,
    subject: `Your order ${data.orderNumber} has been delivered!`,
    template: "order_delivered",
    payload: data,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h1 style="color:#E8315B">Order Delivered! 🎉</h1>
        <p>Your order <strong>${data.orderNumber}</strong> has been delivered.</p>
        <p>How was your experience? Leave a review and help other shoppers.</p>
        <a href="${process.env.WEB_BASE_URL}/account/reviews" style="display:inline-block;background:#E8315B;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">
          Write a Review
        </a>
      </div>`,
  });
}

export async function sendPasswordReset(to: string, resetUrl: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Reset your Thapsus Store password",
    template: "password_reset",
    payload: { resetUrl },
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h1>Reset Password</h1>
        <p>Click the link below to reset your password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#E8315B;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">
          Reset Password
        </a>
        <p style="color:#888;font-size:13px;margin-top:24px">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>`,
  });
}

export async function sendPriceDrop(
  to: string,
  data: { productName: string; oldPriceCents: number; newPriceCents: number; productSlug: string },
): Promise<void> {
  const saving = data.oldPriceCents - data.newPriceCents;
  await sendEmail({
    to,
    subject: `Price drop on "${data.productName}"!`,
    template: "price_drop",
    payload: data,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h1 style="color:#E8315B">Price Drop Alert 🔥</h1>
        <p>An item on your wishlist just got cheaper!</p>
        <p><strong>${data.productName}</strong></p>
        <p>
          <span style="text-decoration:line-through;color:#888">KES ${Math.round(data.oldPriceCents / 100).toLocaleString()}</span>
          &rarr; <strong style="color:#E8315B">KES ${Math.round(data.newPriceCents / 100).toLocaleString()}</strong>
          <span style="background:#FFB800;padding:2px 8px;border-radius:4px;margin-left:8px">
            Save KES ${Math.round(saving / 100).toLocaleString()}
          </span>
        </p>
        <a href="${process.env.WEB_BASE_URL}/p/${data.productSlug}" style="display:inline-block;background:#E8315B;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">
          Buy Now
        </a>
      </div>`,
  });
}
