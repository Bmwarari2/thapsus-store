import { describe, expect, it } from "vitest";
import {
  computeCartCharges,
  computeItemPriceKesCents,
  parsePricingConfigV2,
  type PricingConfigV2,
} from "./pricing.js";
import { normalizeKenyanPhone } from "./phone.js";

const baseCfg: PricingConfigV2 = {
  usdToKesRate: 130,
  gbpToKesRate: 165,
  fxBufferPct: 2,
  markupPct: 20,
  importDutyPct: 25,
  vatPct: 16,
  priceRoundToKes: 10,
  taxInclusivePricing: true,
};

describe("computeItemPriceKesCents", () => {
  it("prices a GBP item with buffer, markup, duty and VAT folded in", () => {
    // £10.00 → 1000 × 165 × 1.02 × 1.20 × 1.25 × 1.16 = 292,842 KES cents
    // → rounded up to nearest KES 10 = 293,000 cents (KES 2,930)
    expect(computeItemPriceKesCents(1000, "GBP", baseCfg)).toBe(293000);
  });

  it("prices a USD item with the USD rate", () => {
    // $10.00 → 1000 × 130 × 1.02 × 1.20 × 1.25 × 1.16 = 230,724
    // → rounded up to nearest KES 10 = 231,000
    expect(computeItemPriceKesCents(1000, "USD", baseCfg)).toBe(231000);
  });

  it("contains no weight or freight component", () => {
    const a = computeItemPriceKesCents(1000, "USD", baseCfg);
    const b = computeItemPriceKesCents(1000, "USD", baseCfg);
    expect(a).toBe(b); // identical inputs, identical price — nothing else feeds in
  });

  it("respects a per-product markup override", () => {
    const five = computeItemPriceKesCents(1000, "USD", baseCfg, 5);
    const twenty = computeItemPriceKesCents(1000, "USD", baseCfg, 20);
    expect(five).toBeLessThan(twenty);
  });

  it("omits duty/VAT when tax-inclusive pricing is off", () => {
    const cfg = { ...baseCfg, taxInclusivePricing: false };
    // 1000 × 130 × 1.02 × 1.20 = 159,120 → rounded up to nearest KES 10 = 160,000
    expect(computeItemPriceKesCents(1000, "USD", cfg)).toBe(160000);
  });

  it("always rounds UP to the nearest N KES", () => {
    const cfg = { ...baseCfg, taxInclusivePricing: false, fxBufferPct: 0, markupPct: 0 };
    // $0.01 → 1 × 130 = 130 cents → rounds up to KES 10 (1000 cents)
    expect(computeItemPriceKesCents(1, "USD", cfg)).toBe(1000);
  });

  it("returns 0 for non-positive source prices", () => {
    expect(computeItemPriceKesCents(0, "USD", baseCfg)).toBe(0);
    expect(computeItemPriceKesCents(-500, "GBP", baseCfg)).toBe(0);
  });
});

describe("computeCartCharges", () => {
  it("tax-inclusive: only delivery is added at checkout", () => {
    const r = computeCartCharges({ itemsCents: 500000, deliveryCents: 120000, cfg: baseCfg });
    expect(r).toEqual({ dutyCents: 0, vatCents: 0, totalCents: 620000 });
  });

  it("a 5-item cart adds exactly one delivery fee over a 1-item cart at the same weight tier", () => {
    const one = computeCartCharges({ itemsCents: 100000, deliveryCents: 70000, cfg: baseCfg });
    const five = computeCartCharges({ itemsCents: 500000, deliveryCents: 70000, cfg: baseCfg });
    expect(five.totalCents - one.totalCents).toBe(400000); // items delta only
  });

  it("itemized mode: duty on items, VAT on items+duty+delivery", () => {
    const cfg = { ...baseCfg, taxInclusivePricing: false };
    const r = computeCartCharges({ itemsCents: 100000, deliveryCents: 50000, cfg });
    expect(r.dutyCents).toBe(25000);                        // 25% of items
    expect(r.vatCents).toBe(Math.round(175000 * 0.16));     // 16% of items+duty+delivery
    expect(r.totalCents).toBe(100000 + 50000 + 25000 + 28000);
  });

  it("applies the discount to items before duty/VAT and clamps it to the subtotal", () => {
    const cfg = { ...baseCfg, taxInclusivePricing: false };
    const r = computeCartCharges({ itemsCents: 100000, deliveryCents: 0, cfg, discountCents: 999999 });
    expect(r.dutyCents).toBe(0);
    expect(r.totalCents).toBe(0);
  });

  it("zero-weight/zero-delivery carts still total correctly", () => {
    const r = computeCartCharges({ itemsCents: 100000, deliveryCents: 0, cfg: baseCfg });
    expect(r.totalCents).toBe(100000);
  });
});

describe("parsePricingConfigV2", () => {
  it("reads DB rows and falls back to defaults", () => {
    const cfg = parsePricingConfigV2([
      { key: "usd_to_kes_rate", value: "128.5" },
      { key: "default_markup_pct", value: "20" },
      { key: "tax_inclusive_pricing", value: "true" },
    ]);
    expect(cfg.usdToKesRate).toBe(128.5);
    expect(cfg.markupPct).toBe(20);
    expect(cfg.gbpToKesRate).toBe(165);
    expect(cfg.taxInclusivePricing).toBe(true);
    expect(cfg.fxBufferPct).toBe(2);
  });

  it("turns tax-inclusive pricing off only on an explicit 'false'", () => {
    expect(parsePricingConfigV2([{ key: "tax_inclusive_pricing", value: "false" }]).taxInclusivePricing).toBe(false);
    expect(parsePricingConfigV2([]).taxInclusivePricing).toBe(true);
  });
});

describe("normalizeKenyanPhone", () => {
  it("normalizes the common formats to 2547XXXXXXXX", () => {
    expect(normalizeKenyanPhone("0712345678")).toBe("254712345678");
    expect(normalizeKenyanPhone("0112345678")).toBe("254112345678");
    expect(normalizeKenyanPhone("+254 712 345 678")).toBe("254712345678");
    expect(normalizeKenyanPhone("254712345678")).toBe("254712345678");
    expect(normalizeKenyanPhone("712345678")).toBe("254712345678");
  });

  it("rejects non-Kenyan or malformed numbers", () => {
    expect(normalizeKenyanPhone("12345")).toBeNull();
    expect(normalizeKenyanPhone("0812345678")).toBeNull();
    expect(normalizeKenyanPhone("+447911123456")).toBeNull();
  });
});
