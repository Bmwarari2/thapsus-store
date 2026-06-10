/**
 * Delivery pricing: one fee per order, looked up from the shipping_rates
 * weight tiers against the cart's total weight (Σ weight_grams × qty).
 */

import { db } from "../db.js";

export interface DeliveryQuote {
  feeCents: number;
  estDaysMin: number;
  estDaysMax: number;
}

export async function deliveryFeeForWeight(totalWeightGrams: number): Promise<DeliveryQuote> {
  const { rows } = await db.query(
    `SELECT weight_min_g, weight_max_g, fee_kes_cents, est_days_min, est_days_max
     FROM shipping_rates WHERE is_active = true
     ORDER BY weight_min_g`,
  );
  if (!rows.length) throw new Error("No active shipping_rates configured");

  const weight = Math.max(0, Math.round(totalWeightGrams));
  const match = rows.find(
    (t: Record<string, unknown>) => weight >= Number(t.weight_min_g) && weight <= Number(t.weight_max_g),
  );
  if (match) {
    return {
      feeCents: Number(match.fee_kes_cents),
      estDaysMin: Number(match.est_days_min),
      estDaysMax: Number(match.est_days_max),
    };
  }

  // Heavier than the top tier: extrapolate at the top tier's average per-kg rate.
  const top = rows[rows.length - 1];
  const topMax = Number(top.weight_max_g);
  const topFee = Number(top.fee_kes_cents);
  const perKgCents = topFee / (topMax / 1000);
  const extraKg = Math.ceil((weight - topMax) / 1000);
  return {
    feeCents: Math.round(topFee + extraKg * perKgCents),
    estDaysMin: Number(top.est_days_min),
    estDaysMax: Number(top.est_days_max) + 7,
  };
}
