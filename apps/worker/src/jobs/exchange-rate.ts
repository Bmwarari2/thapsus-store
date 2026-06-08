/**
 * Daily exchange rate updater.
 * Fetches the latest USD→KES rate from exchangerate-api.com (free tier).
 * Updates pricing_config and exchange_rates table, then triggers a full reprice.
 */

import { db } from "../db.js";

const EXCHANGE_API_URL = "https://open.er-api.com/v6/latest/USD";

interface ExchangeRateResponse {
  result: string;
  rates: Record<string, number>;
  time_last_update_utc?: string;
}

export async function updateExchangeRate(): Promise<void> {
  console.log("[exchange-rate] fetching latest USD→KES and GBP→KES rates...");

  let usdToKes: number;
  let gbpToKes: number;

  try {
    const res = await fetch(EXCHANGE_API_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as ExchangeRateResponse;

    if (data.result !== "success" || !data.rates.KES || !data.rates.GBP) {
      throw new Error("Invalid API response");
    }
    // Rates are relative to USD. GBP→KES = (USD→KES) / (USD→GBP).
    usdToKes = data.rates.KES;
    gbpToKes = data.rates.KES / data.rates.GBP;
  } catch (err) {
    console.error("[exchange-rate] fetch failed, keeping existing rates:", err);
    return;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const usd = round2(usdToKes);
  const gbp = round2(gbpToKes);

  // Update pricing_config (used by the pricing engine)
  await db.query(
    `UPDATE pricing_config SET value = $1, updated_at = now() WHERE key = 'usd_to_kes_rate'`,
    [String(usd)],
  );
  await db.query(
    `UPDATE pricing_config SET value = $1, updated_at = now() WHERE key = 'gbp_to_kes_rate'`,
    [String(gbp)],
  );

  // Insert into exchange_rates history
  await db.query(
    `INSERT INTO exchange_rates (base, quote, rate, source) VALUES
       ('USD', 'KES', $1, 'open.er-api.com'),
       ('GBP', 'KES', $2, 'open.er-api.com')`,
    [usd, gbp],
  );

  console.log(`[exchange-rate] updated USD→KES to ${usd}, GBP→KES to ${gbp}`);

  // Trigger full reprice of all active products
  await repriceAllProducts(usd, gbp);
}

async function repriceAllProducts(usdToKes: number, gbpToKes: number): Promise<void> {
  // Load full pricing config
  const { rows: configRows } = await db.query(`SELECT key, value FROM pricing_config`);
  const config: Record<string, number> = {};
  for (const r of configRows) config[r.key] = parseFloat(r.value);

  const markupPct = config.default_markup_pct ?? 5;
  const dutyPct = config.import_duty_pct ?? 25;
  const vatPct = config.vat_pct ?? 16;
  const baseShippingKes = (config.base_shipping_kes ?? 50000) / 100;
  const perKgKes = (config.per_kg_shipping_kes ?? 15000) / 100;

  const { rows: products } = await db.query(
    `SELECT id, source_price_usd_cents, source_currency, markup_pct FROM products WHERE is_active = true`,
  );

  let updated = 0;
  for (const p of products) {
    const effectiveMarkup = Number(p.markup_pct) ?? markupPct;
    const rate = p.source_currency === "GBP" ? gbpToKes : usdToKes;
    const sourcePrice = Number(p.source_price_usd_cents) / 100;
    const sourcePriceKes = sourcePrice * rate;
    const markedUpKes = sourcePriceKes * (1 + effectiveMarkup / 100);
    const shippingKes = baseShippingKes + (0.5 * perKgKes); // default 500g
    const cifKes = markedUpKes + shippingKes;
    const dutyKes = cifKes * (dutyPct / 100);
    const vatKes = (cifKes + dutyKes) * (vatPct / 100);
    const totalKes = markedUpKes + shippingKes + dutyKes + vatKes;

    await db.query(
      `UPDATE products
       SET shipping_fee_kes_cents = $2,
           tax_kes_cents          = $3,
           sell_price_kes_cents   = $4,
           updated_at             = now()
       WHERE id = $1`,
      [
        p.id,
        Math.round(shippingKes * 100),
        Math.round(vatKes * 100),
        Math.round(totalKes * 100),
      ],
    );
    updated++;
  }

  console.log(`[exchange-rate] repriced ${updated} products at rate ${usdToKes}`);
}
