/**
 * Loads pricing config from the DB and wraps the shared pricing engine.
 * Caches the config in-process for 5 minutes to avoid a DB hit on every request.
 */

import { db } from "../db.js";
import {
  computeItemPriceKesCents,
  parsePricingConfigV2,
  REPRICE_ALL_PRODUCTS_SQL,
  type PricingConfigV2,
  type SourceCurrency,
} from "@thapsus/shared";

let cachedConfig: PricingConfigV2 | null = null;
let cacheExpiry = 0;

export async function loadPricingConfig(): Promise<PricingConfigV2> {
  if (cachedConfig && Date.now() < cacheExpiry) return cachedConfig;
  const { rows } = await db.query(`SELECT key, value FROM pricing_config`);
  cachedConfig = parsePricingConfigV2(rows);
  cacheExpiry = Date.now() + 5 * 60 * 1000; // 5 min
  return cachedConfig;
}

export function invalidatePricingCache(): void {
  cachedConfig = null;
  cacheExpiry = 0;
}

/** Item price for one product under the live config. No weight, no freight. */
export async function priceItem(
  sourcePriceCents: number,
  sourceCurrency: SourceCurrency = "USD",
  markupPctOverride?: number,
): Promise<number> {
  const config = await loadPricingConfig();
  return computeItemPriceKesCents(sourcePriceCents, sourceCurrency, config, markupPctOverride);
}

/** Set-based reprice of every active product. Returns rows changed. */
export async function repriceAllProducts(): Promise<number> {
  const { rowCount } = await db.query(REPRICE_ALL_PRODUCTS_SQL);
  invalidatePricingCache();
  return rowCount ?? 0;
}
