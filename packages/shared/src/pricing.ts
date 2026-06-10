// Core pricing engine v2.
// All monetary amounts are in minor units (cents for KES, cents/pence for the
// source currency). Integer-cent math throughout.
//
// Model:
//   • Item price (browse/PDP/cart) =
//       source × fx × (1 + fxBuffer%) × (1 + markup%) [× (1 + duty%) × (1 + VAT%)]
//     The duty/VAT factors apply when taxInclusivePricing is on (the default):
//     "the price you see is final". Rounded UP to the nearest N KES.
//     No weight, no freight in item prices — ever.
//   • Delivery is computed per cart at checkout from real weights against the
//     shipping_rates tiers. It is the only checkout-level charge in
//     tax-inclusive mode.
//   • When taxInclusivePricing is off, duty/VAT are instead itemized at
//     checkout via computeCartCharges.

import type { SourceCurrency } from "./types.js";

export interface PricingConfigV2 {
  usdToKesRate: number;        // e.g. 130
  gbpToKesRate: number;        // e.g. 165
  fxBufferPct: number;         // e.g. 2 — cushion against FX drift
  markupPct: number;           // default 20
  importDutyPct: number;       // 25
  vatPct: number;              // 16
  priceRoundToKes: number;     // 10 — round item prices up to nearest N KES
  taxInclusivePricing: boolean; // true: duty+VAT folded into item prices
}

/** KES conversion rate for a given source currency (before FX buffer). */
export function rateForCurrency(config: PricingConfigV2, currency: SourceCurrency = "USD"): number {
  return currency === "GBP" ? config.gbpToKesRate : config.usdToKesRate;
}

/**
 * Item price only — what the customer sees on cards, PDP, and cart lines.
 * No weight, no freight. Rounded UP to the nearest `priceRoundToKes` KES.
 */
export function computeItemPriceKesCents(
  sourcePriceCents: number,
  currency: SourceCurrency,
  cfg: PricingConfigV2,
  markupPctOverride?: number,
): number {
  if (sourcePriceCents <= 0) return 0;
  const markupPct = markupPctOverride ?? cfg.markupPct;
  let kesCents =
    sourcePriceCents *
    rateForCurrency(cfg, currency) *
    (1 + cfg.fxBufferPct / 100) *
    (1 + markupPct / 100);
  if (cfg.taxInclusivePricing) {
    kesCents *= (1 + cfg.importDutyPct / 100) * (1 + cfg.vatPct / 100);
  }
  const roundToCents = Math.max(1, Math.round(cfg.priceRoundToKes)) * 100;
  return Math.ceil(kesCents / roundToCents) * roundToCents;
}

export interface CartCharges {
  dutyCents: number;
  vatCents: number;
  totalCents: number;
}

/**
 * Cart-level charges at checkout. `deliveryCents` comes from a shipping_rates
 * lookup the caller does against the cart's total weight.
 *
 * Tax-inclusive mode (default): duty/VAT are already inside item prices, so
 * both are 0 here and total = items − discount + delivery.
 * Itemized mode: duty on the discounted items subtotal; VAT on
 * (items − discount + duty + delivery) — KRA computes VAT on CIF + duty, and
 * CIF includes freight.
 */
export function computeCartCharges(args: {
  itemsCents: number;
  deliveryCents: number;
  cfg: PricingConfigV2;
  discountCents?: number;
}): CartCharges {
  const { itemsCents, deliveryCents, cfg } = args;
  const discountCents = Math.min(Math.max(args.discountCents ?? 0, 0), itemsCents);
  const discountedItems = itemsCents - discountCents;

  if (cfg.taxInclusivePricing) {
    return { dutyCents: 0, vatCents: 0, totalCents: discountedItems + deliveryCents };
  }

  const dutyCents = Math.round(discountedItems * (cfg.importDutyPct / 100));
  const vatCents = Math.round((discountedItems + dutyCents + deliveryCents) * (cfg.vatPct / 100));
  return {
    dutyCents,
    vatCents,
    totalCents: discountedItems + deliveryCents + dutyCents + vatCents,
  };
}

/** Load config values from the pricing_config DB rows into a typed object. */
export function parsePricingConfigV2(rows: { key: string; value: string }[]): PricingConfigV2 {
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    usdToKesRate: Number(m.usd_to_kes_rate ?? 130),
    gbpToKesRate: Number(m.gbp_to_kes_rate ?? 165),
    fxBufferPct: Number(m.fx_buffer_pct ?? 2),
    markupPct: Number(m.default_markup_pct ?? 20),
    importDutyPct: Number(m.import_duty_pct ?? 25),
    vatPct: Number(m.vat_pct ?? 16),
    priceRoundToKes: Number(m.price_round_to_kes ?? 10),
    taxInclusivePricing: (m.tax_inclusive_pricing ?? "true") !== "false",
  };
}

/**
 * Set-based reprice of every product under the v2 formula, reading
 * pricing_config live. Run by both the API ("Reprice all" admin action) and
 * the worker (after the daily FX update) — one statement, no per-row loop.
 * Must stay equivalent to computeItemPriceKesCents.
 */
export const REPRICE_ALL_PRODUCTS_SQL = `
WITH cfg AS (
  SELECT
    max(value::numeric) FILTER (WHERE key = 'usd_to_kes_rate')    AS usd,
    max(value::numeric) FILTER (WHERE key = 'gbp_to_kes_rate')    AS gbp,
    max(value::numeric) FILTER (WHERE key = 'default_markup_pct') AS markup,
    max(value::numeric) FILTER (WHERE key = 'import_duty_pct')    AS duty,
    max(value::numeric) FILTER (WHERE key = 'vat_pct')            AS vat,
    max(value::numeric) FILTER (WHERE key = 'fx_buffer_pct')      AS fxbuf,
    max(value::numeric) FILTER (WHERE key = 'price_round_to_kes') AS round_kes,
    max(value)          FILTER (WHERE key = 'tax_inclusive_pricing') AS tax_incl
  FROM pricing_config
)
UPDATE products p
SET sell_price_kes_cents = ceil(
      p.source_price_usd_cents
      * (CASE WHEN p.source_currency = 'GBP' THEN cfg.gbp ELSE cfg.usd END)
      * (1 + COALESCE(cfg.fxbuf, 0) / 100)
      * (1 + COALESCE(p.markup_pct, cfg.markup) / 100)
      * (CASE WHEN COALESCE(cfg.tax_incl, 'true') = 'true'
              THEN (1 + cfg.duty / 100) * (1 + cfg.vat / 100) ELSE 1 END)
      / (COALESCE(cfg.round_kes, 10) * 100)
    ) * (COALESCE(cfg.round_kes, 10) * 100),
    updated_at = now()
FROM cfg
WHERE p.is_active = true AND p.source_price_usd_cents > 0
  AND p.sell_price_kes_cents <> ceil(
      p.source_price_usd_cents
      * (CASE WHEN p.source_currency = 'GBP' THEN cfg.gbp ELSE cfg.usd END)
      * (1 + COALESCE(cfg.fxbuf, 0) / 100)
      * (1 + COALESCE(p.markup_pct, cfg.markup) / 100)
      * (CASE WHEN COALESCE(cfg.tax_incl, 'true') = 'true'
              THEN (1 + cfg.duty / 100) * (1 + cfg.vat / 100) ELSE 1 END)
      / (COALESCE(cfg.round_kes, 10) * 100)
    ) * (COALESCE(cfg.round_kes, 10) * 100)
`;
