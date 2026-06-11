/**
 * Loads pricing config from the DB and wraps the shared pricing engine.
 * Caches the config in-process for 5 minutes to avoid a DB hit on every request.
 */

import { db } from "../db.js";
import {
  computeItemPriceKesCents,
  parsePricingConfigV2,
  REPRICE_ALL_PRODUCTS_SQL,
  type HsTaxRates,
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

/**
 * HS tax rates for a product (product override → category default) or, when
 * only a category is known (product creation), the category default. NULL →
 * the engine falls back to the flat pricing_config duty/VAT.
 */
export async function hsRatesFor(
  args: { productId: string } | { categoryId: string | null },
): Promise<HsTaxRates | null> {
  type RatesRow = { duty_pct: string; vat_pct: string; excise_pct: string };
  let row: RatesRow | undefined;
  if ("productId" in args) {
    ({ rows: [row] } = await db.query<RatesRow>(
      `SELECT h.duty_pct, h.vat_pct, h.excise_pct
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       JOIN hs_tax_categories h
         ON h.id = COALESCE(p.hs_tax_category_id, c.default_hs_tax_category_id)
       WHERE p.id = $1`,
      [args.productId],
    ));
  } else if (args.categoryId) {
    ({ rows: [row] } = await db.query<RatesRow>(
      `SELECT h.duty_pct, h.vat_pct, h.excise_pct
       FROM categories c
       JOIN hs_tax_categories h ON h.id = c.default_hs_tax_category_id
       WHERE c.id = $1`,
      [args.categoryId],
    ));
  }
  if (!row) return null;
  return {
    dutyPct: Number(row.duty_pct),
    vatPct: Number(row.vat_pct),
    excisePct: Number(row.excise_pct),
  };
}

/** Item price for one product under the live config. No weight, no freight. */
export async function priceItem(
  sourcePriceCents: number,
  sourceCurrency: SourceCurrency = "USD",
  markupPctOverride?: number,
  hsRates?: HsTaxRates | null,
): Promise<number> {
  const config = await loadPricingConfig();
  return computeItemPriceKesCents(sourcePriceCents, sourceCurrency, config, markupPctOverride, hsRates);
}

/** Set-based reprice of every active product. Returns rows changed. */
export async function repriceAllProducts(): Promise<number> {
  const { rowCount } = await db.query(REPRICE_ALL_PRODUCTS_SQL);
  invalidatePricingCache();
  return rowCount ?? 0;
}
