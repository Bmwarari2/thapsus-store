-- ─────────────────────────────────────────────────────────────────────────────
-- ONE-OFF: recompute every sell price under the pricing v2 formula.
--
-- Existing products carried markup_pct = 5 (the old global default, applied to
-- every import) — bump those to the new 20% default. Rows with any other value
-- are treated as deliberate admin overrides and left alone.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE products SET markup_pct = 20 WHERE markup_pct = 5;

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
WHERE p.source_price_usd_cents > 0;

-- Variant price deltas were computed under the old model and will be refreshed
-- on each product's next re-scrape (the import job recomputes per-variant
-- prices through the v2 engine).
