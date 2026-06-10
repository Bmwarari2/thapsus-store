/**
 * Daily exchange rate updater.
 * Fetches the latest USD→KES and GBP→KES rates from open.er-api.com,
 * updates pricing_config and the exchange_rates history, then runs the single
 * shared set-based reprice. Because item prices carry no weight component,
 * a reprice at unchanged rates is a no-op.
 */

import { REPRICE_ALL_PRODUCTS_SQL } from "@thapsus/shared";
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

  await db.query(
    `UPDATE pricing_config SET value = $1, updated_at = now() WHERE key = 'usd_to_kes_rate'`,
    [String(usd)],
  );
  await db.query(
    `UPDATE pricing_config SET value = $1, updated_at = now() WHERE key = 'gbp_to_kes_rate'`,
    [String(gbp)],
  );

  await db.query(
    `INSERT INTO exchange_rates (base, quote, rate, source) VALUES
       ('USD', 'KES', $1, 'open.er-api.com'),
       ('GBP', 'KES', $2, 'open.er-api.com')`,
    [usd, gbp],
  );

  console.log(`[exchange-rate] updated USD→KES to ${usd}, GBP→KES to ${gbp}`);

  const { rowCount } = await db.query(REPRICE_ALL_PRODUCTS_SQL);
  console.log(`[exchange-rate] repriced ${rowCount ?? 0} products`);
}
