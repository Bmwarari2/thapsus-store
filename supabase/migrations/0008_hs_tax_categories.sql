-- ─────────────────────────────────────────────────────────────────────────────
-- HS TAX CATEGORIES (pricing v3)
--
-- Replaces the flat 25% duty + 16% VAT applied to every product with per-item
-- tax rates keyed on the item's HS (Harmonized System) tax category:
--   taxFactor = (1 + duty%) × (1 + excise%) × (1 + VAT%) + (IDF% + RDL%)
-- Resolution: products.hs_tax_category_id → categories.default_hs_tax_category_id
-- → pricing_config fallback (import_duty_pct / vat_pct).
--
-- Seeded rates follow the EAC Common External Tariff bands and Kenyan
-- VAT/excise/levies as commonly applied. They are ADMIN-EDITABLE DEFAULTS,
-- not customs advice — verify against the current EAC CET / Finance Act (or a
-- clearing agent) and adjust the rows, then "Reprice all".
--
-- Also retires the unintended 20% default markup: the intended default is 10%.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE hs_tax_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,   -- HS chapter/heading hint, e.g. '61-62'
  name       text NOT NULL,
  duty_pct   numeric(5,2) NOT NULL DEFAULT 25,
  vat_pct    numeric(5,2) NOT NULL DEFAULT 16,
  excise_pct numeric(5,2) NOT NULL DEFAULT 0,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE hs_tax_categories ENABLE ROW LEVEL SECURITY;

INSERT INTO hs_tax_categories (code, name, duty_pct, vat_pct, excise_pct, notes) VALUES
  ('61-62', 'Apparel & clothing',          35, 16, 0,  'EAC CET 2022 35% band (textiles & apparel)'),
  ('64',    'Footwear',                    35, 16, 0,  'EAC CET 2022 35% band'),
  ('42',    'Bags & leather goods',        25, 16, 0,  'Handbags, travel goods'),
  ('71',    'Jewellery & accessories',     25, 16, 0,  NULL),
  ('33',    'Cosmetics & beauty',          25, 16, 15, 'Kenya excise on imported cosmetics/beauty products'),
  ('2106',  'Food supplements',            10, 16, 0,  'Intermediate-band foodstuffs'),
  ('30',    'Medicaments',                 0,  0,  0,  'Duty-free; VAT-exempt in Kenya'),
  ('8517',  'Phones & tablets',            0,  16, 10, 'CET duty-free; Kenya excise on imported phones'),
  ('8471',  'Computers & laptops',         0,  16, 0,  'CET duty-free (automatic data processing machines)'),
  ('85',    'Consumer electronics',        25, 16, 0,  NULL),
  ('63',    'Home textiles & bedding',     35, 16, 0,  'EAC CET 2022 35% band (made-up textiles)'),
  ('39-73', 'Homeware & furnishings',      25, 16, 0,  NULL),
  ('69-82', 'Kitchenware & dining',        25, 16, 0,  NULL),
  ('95',    'Toys, games & sports',        25, 16, 0,  NULL),
  ('91',    'Watches & clocks',            25, 16, 0,  NULL);

-- ── Wire HS categories into products and store categories ────────────────────

ALTER TABLE products
  ADD COLUMN hs_tax_category_id uuid REFERENCES hs_tax_categories(id);
ALTER TABLE categories
  ADD COLUMN default_hs_tax_category_id uuid REFERENCES hs_tax_categories(id);

-- Store category → default HS tax category. beauty-health defaults to food
-- supplements (the bulk of the current catalogue); flag individual cosmetics
-- per product via products.hs_tax_category_id.
UPDATE categories c
SET default_hs_tax_category_id = h.id
FROM (VALUES
  ('clothing',         '61-62'),
  ('womens-clothing',  '61-62'),
  ('mens-clothing',    '61-62'),
  ('kids-baby',        '61-62'),
  ('shoes-footwear',   '64'),
  ('bags-luggage',     '42'),
  ('accessories',      '71'),
  ('beauty-health',    '2106'),
  ('bedding-bath',     '63'),
  ('home-living',      '39-73'),
  ('kitchen-dining',   '69-82'),
  ('electronics',      '85'),
  ('phones-tablets',   '8517'),
  ('computers-laptops','8471'),
  ('sports-outdoor',   '95')
) AS map(slug, hs_code)
JOIN hs_tax_categories h ON h.code = map.hs_code
WHERE c.slug = map.slug;

-- Existing products inherit their category's default (kept NULL so they keep
-- tracking the category default until an admin pins a product-specific code).

-- ── New statutory levies + intended 10% markup ────────────────────────────────

INSERT INTO pricing_config (key, value, label) VALUES
  ('idf_pct', '2.5', 'Import Declaration Fee on customs value (%)'),
  ('rdl_pct', '1.5', 'Railway Development Levy on customs value (%)')
ON CONFLICT (key) DO NOTHING;

UPDATE pricing_config
SET value = '10', label = 'Default product markup (%)', updated_at = now()
WHERE key = 'default_markup_pct' AND value = '20';

-- Rows that silently inherited the old 20% default move to the intended 10%.
-- Deliberate per-product overrides (any other value) are preserved.
UPDATE products SET markup_pct = 10, updated_at = now() WHERE markup_pct = 20;
