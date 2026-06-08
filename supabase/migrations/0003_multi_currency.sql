-- Multi-currency support.
-- Products can be sourced in different currencies (SHEIN UK = GBP, AliExpress/Alibaba = USD).
-- We track each product's source currency and convert to KES with a per-currency rate.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS source_currency text NOT NULL DEFAULT 'USD';

-- The column name still says "usd" for backwards-compat, but it now holds the
-- price in minor units (cents) of source_currency.
COMMENT ON COLUMN products.source_price_usd_cents IS
  'Source price in minor units (cents) of source_currency. Legacy name — not always USD.';

-- Existing SHEIN products were scraped from SHEIN UK and are priced in GBP.
UPDATE products SET source_currency = 'GBP' WHERE source_platform = 'shein';

-- GBP -> KES rate for the pricing engine. Kept fresh by the daily exchange-rate job.
INSERT INTO pricing_config (key, value, label) VALUES
  ('gbp_to_kes_rate', '165', 'GBP to KES exchange rate')
ON CONFLICT (key) DO NOTHING;

-- Seed a starting GBP->KES history row; the worker updates this daily.
INSERT INTO exchange_rates (base, quote, rate, source) VALUES
  ('GBP', 'KES', 165.0000, 'manual_seed');
