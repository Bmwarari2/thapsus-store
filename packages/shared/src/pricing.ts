// Core pricing engine v3 (HS-aware taxes).
// All monetary amounts are in minor units (cents for KES, cents/pence for the
// source currency). Integer-cent math throughout.
//
// Model:
//   • Item price (browse/PDP/cart) =
//       source × fx × (1 + fxBuffer%) × (1 + markup%) [× taxFactor]
//     The tax factor applies when taxInclusivePricing is on (the default):
//     "the price you see is final". Rounded UP to the nearest N KES.
//     No weight, no freight in item prices — ever.
//   • Taxes are per HS tax category (Kenya/EAC customs bands), resolved
//     product.hs_tax_category_id → category default → pricing_config fallback:
//       taxFactor = (1 + duty%) × (1 + excise%) × (1 + VAT%) + (IDF% + RDL%)
//     Duty compounds first, excise on duty-inclusive value, VAT on top of
//     both (KRA's cascade); IDF and RDL are flat levies on customs value.
//   • Delivery is computed per cart at checkout from real weights against the
//     shipping_rates tiers. It is the only checkout-level charge in
//     tax-inclusive mode.
//   • When taxInclusivePricing is off, duty/VAT are instead itemized at
//     checkout via computeCartCharges (flat config rates — the per-item HS
//     breakdown only feeds item prices).

import type { SourceCurrency } from "./types.js";

export interface PricingConfigV2 {
  usdToKesRate: number;        // e.g. 130
  gbpToKesRate: number;        // e.g. 165
  fxBufferPct: number;         // e.g. 2 — cushion against FX drift
  markupPct: number;           // default 10
  importDutyPct: number;       // 25 — fallback when no HS category resolves
  vatPct: number;              // 16 — fallback when no HS category resolves
  idfPct: number;              // 2.5 — Import Declaration Fee, on customs value
  rdlPct: number;              // 1.5 — Railway Development Levy, on customs value
  priceRoundToKes: number;     // 10 — round item prices up to nearest N KES
  taxInclusivePricing: boolean; // true: taxes folded into item prices
}

/** Per-item tax rates from the item's HS tax category. */
export interface HsTaxRates {
  dutyPct: number;
  vatPct: number;
  excisePct: number;
}

/** KES conversion rate for a given source currency (before FX buffer). */
export function rateForCurrency(config: PricingConfigV2, currency: SourceCurrency = "USD"): number {
  return currency === "GBP" ? config.gbpToKesRate : config.usdToKesRate;
}

/**
 * Multiplier that folds import taxes into an item price. Uses the item's HS
 * category rates when given, else the flat config fallbacks. 1 when
 * tax-inclusive pricing is off.
 */
export function taxInclusiveFactor(cfg: PricingConfigV2, rates?: HsTaxRates | null): number {
  if (!cfg.taxInclusivePricing) return 1;
  const dutyPct = rates?.dutyPct ?? cfg.importDutyPct;
  const vatPct = rates?.vatPct ?? cfg.vatPct;
  const excisePct = rates?.excisePct ?? 0;
  return (
    (1 + dutyPct / 100) * (1 + excisePct / 100) * (1 + vatPct / 100) +
    (cfg.idfPct + cfg.rdlPct) / 100
  );
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
  hsRates?: HsTaxRates | null,
): number {
  if (sourcePriceCents <= 0) return 0;
  const markupPct = markupPctOverride ?? cfg.markupPct;
  const kesCents =
    sourcePriceCents *
    rateForCurrency(cfg, currency) *
    (1 + cfg.fxBufferPct / 100) *
    (1 + markupPct / 100) *
    taxInclusiveFactor(cfg, hsRates);
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
 * Tax-inclusive mode (default): taxes are already inside item prices, so
 * both are 0 here and total = items − discount + delivery.
 * Itemized mode: duty on the discounted items subtotal; VAT on
 * (items − discount + duty + delivery) — KRA computes VAT on CIF + duty, and
 * CIF includes freight. Flat config rates (no per-item HS breakdown here).
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
    markupPct: Number(m.default_markup_pct ?? 10),
    importDutyPct: Number(m.import_duty_pct ?? 25),
    vatPct: Number(m.vat_pct ?? 16),
    idfPct: Number(m.idf_pct ?? 2.5),
    rdlPct: Number(m.rdl_pct ?? 1.5),
    priceRoundToKes: Number(m.price_round_to_kes ?? 10),
    taxInclusivePricing: (m.tax_inclusive_pricing ?? "true") !== "false",
  };
}

/**
 * Set-based reprice of every product under the v3 formula, reading
 * pricing_config and each product's HS tax category live (product override →
 * category default → config fallback). Run by both the API ("Reprice all"
 * admin action) and the worker (after the daily FX update) — one statement,
 * no per-row loop. Must stay equivalent to computeItemPriceKesCents.
 */
export const REPRICE_ALL_PRODUCTS_SQL = `
WITH cfg AS (
  SELECT
    max(value::numeric) FILTER (WHERE key = 'usd_to_kes_rate')    AS usd,
    max(value::numeric) FILTER (WHERE key = 'gbp_to_kes_rate')    AS gbp,
    max(value::numeric) FILTER (WHERE key = 'default_markup_pct') AS markup,
    max(value::numeric) FILTER (WHERE key = 'import_duty_pct')    AS duty,
    max(value::numeric) FILTER (WHERE key = 'vat_pct')            AS vat,
    max(value::numeric) FILTER (WHERE key = 'idf_pct')            AS idf,
    max(value::numeric) FILTER (WHERE key = 'rdl_pct')            AS rdl,
    max(value::numeric) FILTER (WHERE key = 'fx_buffer_pct')      AS fxbuf,
    max(value::numeric) FILTER (WHERE key = 'price_round_to_kes') AS round_kes,
    max(value)          FILTER (WHERE key = 'tax_inclusive_pricing') AS tax_incl
  FROM pricing_config
)
UPDATE products p
SET sell_price_kes_cents = calc.new_price,
    updated_at = now()
FROM cfg
CROSS JOIN LATERAL (
  SELECT
    COALESCE(h.duty_pct,   cfg.duty) AS duty,
    COALESCE(h.vat_pct,    cfg.vat)  AS vat,
    COALESCE(h.excise_pct, 0)        AS excise
  FROM (SELECT 1) AS one
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN hs_tax_categories h
    ON h.id = COALESCE(p.hs_tax_category_id, c.default_hs_tax_category_id)
) rates
CROSS JOIN LATERAL (
  SELECT ceil(
      p.source_price_usd_cents
      * (CASE WHEN p.source_currency = 'GBP' THEN cfg.gbp ELSE cfg.usd END)
      * (1 + COALESCE(cfg.fxbuf, 0) / 100)
      * (1 + COALESCE(p.markup_pct, cfg.markup) / 100)
      * (CASE WHEN COALESCE(cfg.tax_incl, 'true') = 'true'
              THEN (1 + rates.duty / 100) * (1 + rates.excise / 100) * (1 + rates.vat / 100)
                   + (COALESCE(cfg.idf, 0) + COALESCE(cfg.rdl, 0)) / 100
              ELSE 1 END)
      / (COALESCE(cfg.round_kes, 10) * 100)
    ) * (COALESCE(cfg.round_kes, 10) * 100) AS new_price
) calc
WHERE p.is_active = true AND p.source_price_usd_cents > 0
  AND p.sell_price_kes_cents <> calc.new_price
`;
