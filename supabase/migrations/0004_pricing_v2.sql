-- ─────────────────────────────────────────────────────────────────────────────
-- PRICING V2 + CHECKOUT QUOTES + DATA-INTEGRITY FIXES
--
-- Pricing model v2 (tax-inclusive item prices):
--   item price = source × fx × (1 + fx buffer) × (1 + markup) × (1 + duty) × (1 + VAT)
--   Delivery is the ONLY checkout-level charge, computed from real cart weight
--   against shipping_rates tiers. Nothing is charged twice.
--
-- Also: weight becomes first-class data, products get a real source-dedupe
-- constraint, variants get stable identity, carts/orders survive variant churn,
-- and checkout moves to a quote → order → pay flow.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Weight becomes first-class ───────────────────────────────────────────────

ALTER TABLE products
  ADD COLUMN weight_grams integer NOT NULL DEFAULT 500,
  ADD COLUMN weight_source text NOT NULL DEFAULT 'category_default'
    CHECK (weight_source IN ('scraped','category_default','manual')),
  ADD COLUMN compare_at_kes_cents bigint;          -- strike-through price (from source list price)

-- ── Kill the baked-in shipping/tax model ─────────────────────────────────────

ALTER TABLE products
  DROP COLUMN shipping_fee_kes_cents,
  DROP COLUMN tax_kes_cents;

-- ── Real source dedupe + feed indexes ────────────────────────────────────────
-- Defuse any existing duplicates first (keep the oldest row per source pair).

WITH dupes AS (
  SELECT id, row_number() OVER (
    PARTITION BY source_platform, source_id ORDER BY created_at
  ) AS rn
  FROM products
  WHERE source_platform IS NOT NULL AND source_id IS NOT NULL
)
UPDATE products p
SET source_id = p.source_id || '-dup-' || p.id, is_active = false
FROM dupes d
WHERE p.id = d.id AND d.rn > 1;

ALTER TABLE products
  ADD CONSTRAINT uq_products_source UNIQUE (source_platform, source_id);
DROP INDEX IF EXISTS idx_products_source;

CREATE INDEX idx_products_feed_newest  ON products (is_active, created_at DESC, id DESC);
CREATE INDEX idx_products_feed_popular ON products (is_active, order_count DESC, id DESC);
CREATE INDEX idx_products_feed_price   ON products (is_active, sell_price_kes_cents, id);

-- ── Stable variant identity ──────────────────────────────────────────────────
-- variant_key = canonical attributes key. Imports upsert by key so variant ids
-- (and the carts/orders pointing at them) survive re-scrapes.
-- The md5 backfill below differs from the app's canonical-JSON key format, so
-- the FIRST re-scrape of each product rotates its variants once (old rows are
-- deactivated, never deleted — existing references stay valid). Every refresh
-- after that is stable.

ALTER TABLE product_variants
  ADD COLUMN variant_key text;
UPDATE product_variants SET variant_key = md5(attributes::text) WHERE variant_key IS NULL;

-- Defuse duplicate keys within a product before adding the unique constraint.
WITH dupes AS (
  SELECT id, row_number() OVER (PARTITION BY product_id, variant_key ORDER BY sort_order, created_at) AS rn
  FROM product_variants
)
UPDATE product_variants pv
SET variant_key = pv.variant_key || '-dup-' || pv.id, is_active = false
FROM dupes d
WHERE pv.id = d.id AND d.rn > 1;

ALTER TABLE product_variants
  ALTER COLUMN variant_key SET NOT NULL,
  ADD CONSTRAINT uq_variant_key UNIQUE (product_id, variant_key);

-- ── Cart line uniqueness including NULL variant (PG15+) ──────────────────────
-- Merge any duplicate variant-less lines first.

WITH ranked AS (
  SELECT id, cart_id, product_id, qty,
         row_number() OVER (PARTITION BY cart_id, product_id ORDER BY added_at) AS rn,
         sum(qty)     OVER (PARTITION BY cart_id, product_id) AS total_qty
  FROM cart_items WHERE variant_id IS NULL
)
UPDATE cart_items ci SET qty = r.total_qty
FROM ranked r WHERE ci.id = r.id AND r.rn = 1;

DELETE FROM cart_items ci
USING (
  SELECT id, row_number() OVER (PARTITION BY cart_id, product_id ORDER BY added_at) AS rn
  FROM cart_items WHERE variant_id IS NULL
) r
WHERE ci.id = r.id AND r.rn > 1;

ALTER TABLE cart_items DROP CONSTRAINT cart_items_cart_id_product_id_variant_id_key;
ALTER TABLE cart_items
  ADD CONSTRAINT uq_cart_line UNIQUE NULLS NOT DISTINCT (cart_id, product_id, variant_id);

-- ── Protect cart/order references from variant churn ─────────────────────────

ALTER TABLE cart_items DROP CONSTRAINT cart_items_variant_id_fkey;
ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_variant_id_fkey FOREIGN KEY (variant_id)
    REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE order_items DROP CONSTRAINT order_items_variant_id_fkey;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id)
    REFERENCES product_variants(id) ON DELETE SET NULL;

-- ── Checkout quotes (server-priced, replayed at order time) ───────────────────

CREATE TABLE order_quotes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  items          jsonb NOT NULL,        -- [{productId,variantId,qty,unitPriceCents,weightGrams,nameSnap,imageSnap,attrsSnap}]
  items_cents    bigint NOT NULL,
  delivery_cents bigint NOT NULL,
  duty_cents     bigint NOT NULL DEFAULT 0,
  vat_cents      bigint NOT NULL DEFAULT 0,
  discount_cents bigint NOT NULL DEFAULT 0,
  total_cents    bigint NOT NULL,
  promotion_id   uuid REFERENCES promotions(id),
  fx_usd         numeric(12,4) NOT NULL,
  fx_gbp         numeric(12,4) NOT NULL,
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_quotes_user ON order_quotes (user_id, created_at DESC);

-- ── Orders: explicit duty/vat lines, idempotency, quote linkage ───────────────

ALTER TABLE orders
  ADD COLUMN duty_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN vat_cents  bigint NOT NULL DEFAULT 0,
  ADD COLUMN quote_id   uuid REFERENCES order_quotes(id),
  ADD COLUMN idempotency_key text,
  ADD COLUMN mpesa_checkout_request_id text;        -- stop overloading payment_ref
CREATE UNIQUE INDEX uq_orders_idem  ON orders (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX uq_orders_mpesa ON orders (mpesa_checkout_request_id) WHERE mpesa_checkout_request_id IS NOT NULL;
CREATE UNIQUE INDEX uq_orders_quote ON orders (quote_id) WHERE quote_id IS NOT NULL;

-- ── Category weight defaults + scrape spend ledger ───────────────────────────

CREATE TABLE category_weight_defaults (
  category_slug text PRIMARY KEY,
  weight_grams  integer NOT NULL
);
INSERT INTO category_weight_defaults VALUES
  ('clothing',250),('womens-clothing',300),('mens-clothing',350),('shoes-footwear',900),
  ('electronics',800),('phones-tablets',400),('computers-laptops',2200),('home-living',800),
  ('kitchen-dining',900),('bedding-bath',1200),('beauty-health',300),('sports-outdoor',700),
  ('kids-baby',300),('accessories',150),('bags-luggage',1000);

-- Backfill existing products with their category's default weight (scrapers
-- never persisted weight before this migration, so every row is a default).
UPDATE products p
SET weight_grams = cwd.weight_grams
FROM categories c
JOIN category_weight_defaults cwd ON cwd.category_slug = c.slug
WHERE p.category_id = c.id;

CREATE TABLE scrape_calls (
  id         bigserial PRIMARY KEY,
  provider   text NOT NULL DEFAULT 'oxylabs',
  source     text NOT NULL,            -- oxylabs 'source' param
  job_id     uuid REFERENCES import_jobs(id),
  ok         boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_scrape_calls_day ON scrape_calls (created_at);

-- Per-job cap on search imports
ALTER TABLE import_jobs ADD COLUMN max_products integer;

-- ── Commercial shipping_rates re-seed ─────────────────────────────────────────
-- The old tiers (~KES 150/kg-equivalent) were below the ~£3.2–3.5/kg freight
-- cost. Delivery is the visible margin line now that item markup is modest.
-- Carts beyond the top tier are extrapolated in code at the top tier's
-- average per-kg rate. Admin-editable.

UPDATE shipping_rates SET is_active = false;
INSERT INTO shipping_rates (weight_min_g, weight_max_g, fee_kes_cents, est_days_min, est_days_max) VALUES
  (0,     500,    70000,  7,  10),
  (501,   1000,   120000, 7,  10),
  (1001,  2000,   220000, 8,  12),
  (2001,  5000,   520000, 10, 14),
  (5001,  10000,  990000, 12, 16);

-- ── pricing_config: retire baked-shipping knobs; add the v2 knobs ─────────────

DELETE FROM pricing_config WHERE key IN ('base_shipping_kes','per_kg_shipping_kes');

UPDATE pricing_config
SET value = '20', label = 'Default product markup (%)', updated_at = now()
WHERE key = 'default_markup_pct' AND value = '5';

INSERT INTO pricing_config (key, value, label) VALUES
  ('fx_buffer_pct',              '2',    'FX buffer applied to exchange rates when pricing (%)'),
  ('tax_inclusive_pricing',      'true', 'Fold import duty + VAT into item prices (true) or charge at checkout (false)'),
  ('price_round_to_kes',         '10',   'Round item prices up to nearest N KES'),
  ('scrape_daily_budget',        '400',  'Max Oxylabs calls per day'),
  ('search_import_max_products', '24',   'Max products fetched per search import'),
  ('scheduled_search_query',     'women summer fashion', 'Weekly auto-scrape search query')
ON CONFLICT (key) DO NOTHING;

-- ── RLS: enable deny-all on every table ───────────────────────────────────────
-- The API talks to Postgres over the direct connection as the table owner
-- (which bypasses non-FORCED RLS); this locks out Supabase's PostgREST surface
-- (anon/authenticated roles) so a leaked anon key reads nothing.
-- Deliberately NOT using FORCE: that would also lock out the owning role the
-- API connects as and brick the app.

DO $$ DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
