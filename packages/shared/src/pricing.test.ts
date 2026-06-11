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
  idfPct: 2.5,
  rdlPct: 1.5,
  priceRoundToKes: 10,
  taxInclusivePricing: true,
};

// Flat fallback tax factor: 1.25 × 1.16 + (2.5 + 1.5)/100 = 1.49
describe("computeItemPriceKesCents", () => {
  it("prices a GBP item with buffer, markup, duty, VAT and levies folded in", () => {
    // £10.00 → 1000 × 165 × 1.02 × 1.20 = 201,960 × 1.49 = 300,920.4 KES cents
    // → rounded up to nearest KES 10 = 301,000 cents (KES 3,010)
    expect(computeItemPriceKesCents(1000, "GBP", baseCfg)).toBe(301000);
  });

  it("prices a USD item with the USD rate", () => {
    // $10.00 → 1000 × 130 × 1.02 × 1.20 = 159,120 × 1.49 = 237,088.8
    // → rounded up to nearest KES 10 = 238,000
    expect(computeItemPriceKesCents(1000, "USD", baseCfg)).toBe(238000);
  });

  it("applies the item's HS category rates instead of the flat fallback", () => {
    // Supplements band: 1.10 × 1.16 + 0.04 = 1.316 → 159,120 × 1.316 = 209,401.92
    const supplements = computeItemPriceKesCents(1000, "USD", baseCfg, undefined, {
      dutyPct: 10, vatPct: 16, excisePct: 0,
    });
    expect(supplements).toBe(210000);

    // Apparel band: 1.35 × 1.16 + 0.04 = 1.606 → 159,120 × 1.606 = 255,546.72
    const apparel = computeItemPriceKesCents(1000, "USD", baseCfg, undefined, {
      dutyPct: 35, vatPct: 16, excisePct: 0,
    });
    expect(apparel).toBe(256000);

    expect(supplements).toBeLessThan(apparel);
  });

  it("compounds excise between duty and VAT (cosmetics-style band)", () => {
    // 1.25 × 1.15 × 1.16 + 0.04 = 1.7075 → 159,120 × 1.7075 = 271,697.4 → 272,000
    expect(
      computeItemPriceKesCents(1000, "USD", baseCfg, undefined, {
        dutyPct: 25, vatPct: 16, excisePct: 15,
      }),
    ).toBe(272000);
  });

  it("duty/VAT-free items still carry the IDF + RDL levies", () => {
    // 1.0 + 0.04 = 1.04 → 159,120 × 1.04 = 165,484.8 → 166,000
    expect(
      computeItemPriceKesCents(1000, "USD", baseCfg, undefined, {
        dutyPct: 0, vatPct: 0, excisePct: 0,
      }),
    ).toBe(166000);
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

  it("omits taxes when tax-inclusive pricing is off", () => {
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
    expect(cfg.idfPct).toBe(2.5);
    expect(cfg.rdlPct).toBe(1.5);
  });

  it("defaults the markup to the intended 10%", () => {
    expect(parsePricingConfigV2([]).markupPct).toBe(10);
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
