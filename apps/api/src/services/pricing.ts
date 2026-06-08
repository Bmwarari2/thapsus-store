/**
 * Loads pricing config from the DB and wraps the shared pricing engine.
 * Caches the config in-process for 5 minutes to avoid a DB hit on every request.
 */

import { db } from "../db.js";
import { computeProductPrice, parsePricingConfig, type PriceBreakdown } from "@thapsus/shared";

let cachedConfig: ReturnType<typeof parsePricingConfig> | null = null;
let cacheExpiry = 0;

export async function loadPricingConfig() {
  if (cachedConfig && Date.now() < cacheExpiry) return cachedConfig;
  const { rows } = await db.query(`SELECT key, value FROM pricing_config`);
  cachedConfig = parsePricingConfig(rows);
  cacheExpiry = Date.now() + 5 * 60 * 1000; // 5 min
  return cachedConfig;
}

export function invalidatePricingCache() {
  cachedConfig = null;
  cacheExpiry = 0;
}

export async function priceProduct(
  sourcePriceUsdCents: number,
  weightGrams: number,
  markupPctOverride?: number,
): Promise<PriceBreakdown> {
  const config = await loadPricingConfig();
  const effectiveConfig = markupPctOverride != null
    ? { ...config, markupPct: markupPctOverride }
    : config;
  return computeProductPrice(sourcePriceUsdCents, weightGrams, effectiveConfig);
}

export async function repriceAllProducts(): Promise<number> {
  const config = await loadPricingConfig();
  const { rows: products } = await db.query(
    `SELECT id, source_price_usd_cents, markup_pct FROM products WHERE is_active = true`,
  );

  let updated = 0;
  for (const p of products) {
    const effectiveConfig = { ...config, markupPct: Number(p.markup_pct) };
    // Use a default weight of 500g for repricing; real weight set during import
    const breakdown = computeProductPrice(Number(p.source_price_usd_cents), 500, effectiveConfig);
    await db.query(
      `UPDATE products
       SET shipping_fee_kes_cents = $2,
           tax_kes_cents          = $3,
           sell_price_kes_cents   = $4,
           updated_at             = now()
       WHERE id = $1`,
      [p.id, breakdown.shippingKes * 100, breakdown.vatKes * 100, breakdown.totalKesCents],
    );
    updated++;
  }
  invalidatePricingCache();
  return updated;
}
