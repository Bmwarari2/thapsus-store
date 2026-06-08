// Core pricing engine.
// All monetary amounts are in minor units (cents for KES, cents for USD).

export interface PricingConfig {
  usdToKesRate: number;      // e.g. 130
  markupPct: number;         // e.g. 5  (= 5%)
  importDutyPct: number;     // e.g. 25 (= 25%)
  vatPct: number;            // e.g. 16 (= 16%)
  baseShippingKes: number;   // KES (not cents), e.g. 500
  perKgShippingKes: number;  // KES per kg, e.g. 150
}

export interface PriceBreakdown {
  sourcePriceKes: number;    // raw USD→KES conversion
  markedUpKes: number;       // after markup
  shippingKes: number;       // freight
  importDutyKes: number;     // duty on CIF
  vatKes: number;            // VAT on (CIF + duty)
  totalKes: number;          // what the customer pays
  // Stored as cents in DB — multiply by 100
  totalKesCents: number;
}

export function computeProductPrice(
  sourcePriceUsdCents: number,
  weightGrams: number,
  config: PricingConfig
): PriceBreakdown {
  const sourcePriceUsd = sourcePriceUsdCents / 100;
  const sourcePriceKes = sourcePriceUsd * config.usdToKesRate;
  const markedUpKes = sourcePriceKes * (1 + config.markupPct / 100);

  const weightKg = weightGrams / 1000;
  const shippingKes = config.baseShippingKes + weightKg * config.perKgShippingKes;

  // CIF = cost + insurance + freight (simplified: markedUp + shipping)
  const cifKes = markedUpKes + shippingKes;
  const importDutyKes = cifKes * (config.importDutyPct / 100);
  const vatKes = (cifKes + importDutyKes) * (config.vatPct / 100);

  const totalKes = markedUpKes + shippingKes + importDutyKes + vatKes;

  return {
    sourcePriceKes: Math.round(sourcePriceKes),
    markedUpKes: Math.round(markedUpKes),
    shippingKes: Math.round(shippingKes),
    importDutyKes: Math.round(importDutyKes),
    vatKes: Math.round(vatKes),
    totalKes: Math.round(totalKes),
    totalKesCents: Math.round(totalKes * 100),
  };
}

/** Load config values from the pricing_config DB rows into a typed object. */
export function parsePricingConfig(rows: { key: string; value: string }[]): PricingConfig {
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    usdToKesRate: Number(m.usd_to_kes_rate ?? 130),
    markupPct: Number(m.default_markup_pct ?? 5),
    importDutyPct: Number(m.import_duty_pct ?? 25),
    vatPct: Number(m.vat_pct ?? 16),
    baseShippingKes: Number(m.base_shipping_kes ?? 50000) / 100,
    perKgShippingKes: Number(m.per_kg_shipping_kes ?? 15000) / 100,
  };
}

/** Human-readable breakdown string for display in admin/checkout. */
export function formatBreakdown(b: PriceBreakdown): string {
  const fmt = (n: number) => `KES ${n.toLocaleString("en-KE")}`;
  return (
    `Product: ${fmt(b.markedUpKes)} + ` +
    `Shipping: ${fmt(b.shippingKes)} + ` +
    `Duty: ${fmt(b.importDutyKes)} + ` +
    `VAT: ${fmt(b.vatKes)} = ` +
    `Total: ${fmt(b.totalKes)}`
  );
}
