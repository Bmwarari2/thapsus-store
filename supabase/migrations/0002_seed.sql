-- ─────────────────────────────────────────────────────────────────────────────
-- SEED DATA
-- Default configuration values and product categories.
-- Safe to re-run (uses INSERT ... ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PRICING CONFIG ───────────────────────────────────────────────────────────
-- All monetary amounts are KES cents unless noted.
-- Admin can update these values via the /admin/pricing panel.

INSERT INTO pricing_config (key, value, label) VALUES
  ('default_markup_pct',   '5',      'Default product markup (%)'),
  ('usd_to_kes_rate',      '130',    'USD to KES exchange rate'),
  ('import_duty_pct',      '25',     'Kenya import duty (% of CIF value)'),
  ('vat_pct',              '16',     'Kenya VAT (% of CIF + duty)'),
  ('base_shipping_kes',    '50000',  'Base air freight fee per order (KES cents = KES 500)'),
  ('per_kg_shipping_kes',  '15000',  'Per-kg shipping surcharge (KES cents = KES 150/kg)'),
  ('est_days_min',         '7',      'Minimum estimated delivery days'),
  ('est_days_max',         '14',     'Maximum estimated delivery days')
ON CONFLICT (key) DO NOTHING;

-- ── SHIPPING RATE TIERS ───────────────────────────────────────────────────────

INSERT INTO shipping_rates (weight_min_g, weight_max_g, fee_kes_cents, est_days_min, est_days_max) VALUES
  (0,      500,    50000,  7,  10),
  (501,    1000,   80000,  7,  10),
  (1001,   2000,   140000, 8,  12),
  (2001,   5000,   280000, 10, 14),
  (5001,   10000,  500000, 12, 16),
  (10001,  99999,  900000, 14, 21)
ON CONFLICT DO NOTHING;

-- ── PRODUCT CATEGORIES ────────────────────────────────────────────────────────

INSERT INTO categories (name, slug, icon, sort_order) VALUES
  ('Clothing & Fashion',  'clothing',       '👗', 1),
  ('Electronics',         'electronics',    '📱', 2),
  ('Home & Living',       'home-living',    '🏠', 3),
  ('Beauty & Health',     'beauty-health',  '💄', 4),
  ('Sports & Outdoor',    'sports-outdoor', '⚽', 5),
  ('Kids & Baby',         'kids-baby',      '🍼', 6),
  ('Accessories',         'accessories',    '👜', 7),
  ('Bags & Luggage',      'bags-luggage',   '🧳', 8)
ON CONFLICT (slug) DO NOTHING;

-- ── SUB-CATEGORIES ────────────────────────────────────────────────────────────
-- Insert after parent categories so the FK is valid.

INSERT INTO categories (name, slug, parent_id, sort_order)
SELECT 'Women''s Clothing', 'womens-clothing', id, 1
FROM categories WHERE slug = 'clothing'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, parent_id, sort_order)
SELECT 'Men''s Clothing', 'mens-clothing', id, 2
FROM categories WHERE slug = 'clothing'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, parent_id, sort_order)
SELECT 'Shoes & Footwear', 'shoes-footwear', id, 3
FROM categories WHERE slug = 'clothing'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, parent_id, sort_order)
SELECT 'Phones & Tablets', 'phones-tablets', id, 1
FROM categories WHERE slug = 'electronics'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, parent_id, sort_order)
SELECT 'Computers & Laptops', 'computers-laptops', id, 2
FROM categories WHERE slug = 'electronics'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, parent_id, sort_order)
SELECT 'Kitchen & Dining', 'kitchen-dining', id, 1
FROM categories WHERE slug = 'home-living'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, parent_id, sort_order)
SELECT 'Bedding & Bath', 'bedding-bath', id, 2
FROM categories WHERE slug = 'home-living'
ON CONFLICT (slug) DO NOTHING;

-- ── INITIAL EXCHANGE RATE ────────────────────────────────────────────────────
-- Starting rate; the worker will update this daily.

INSERT INTO exchange_rates (base, quote, rate, source) VALUES
  ('USD', 'KES', 130.0000, 'manual_seed')
ON CONFLICT DO NOTHING;
