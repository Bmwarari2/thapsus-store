-- ─────────────────────────────────────────────────────────────────────────────
-- THAPSUS STORE — E-COMMERCE SCHEMA v1
-- Fresh database for the rebranded platform.
-- Currency: KES stored as integer cents (divide by 100 for display).
-- USD amounts stored as integer cents; converted to KES at query/pricing time.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ENUMS ────────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('customer', 'admin');

CREATE TYPE order_status AS ENUM (
  'pending_payment',    -- created, awaiting M-Pesa / card
  'payment_confirmed',  -- paid, ready to source
  'sourcing',           -- being ordered from supplier
  'shipped_to_hub',     -- in transit to Kenya hub
  'at_hub',             -- arrived, awaiting customs
  'out_for_delivery',   -- with last-mile courier
  'delivered',          -- confirmed received
  'cancelled',          -- cancelled before shipping
  'refund_requested',
  'refunded'
);

CREATE TYPE import_job_status AS ENUM (
  'queued', 'running', 'done', 'failed', 'skipped'
);

CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');

-- ── USERS ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text        UNIQUE NOT NULL,
  password_hash     text,                         -- null for OAuth users
  full_name         text,
  phone             text,
  role              user_role   NOT NULL DEFAULT 'customer',
  avatar_url        text,
  referral_code     text        UNIQUE DEFAULT upper(substring(gen_random_uuid()::text, 1, 8)),
  referred_by       uuid        REFERENCES users(id),
  marketing_consent boolean     NOT NULL DEFAULT false,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  token_hash  text        PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── CATALOGUE ────────────────────────────────────────────────────────────────

CREATE TABLE categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        UNIQUE NOT NULL,
  description text,
  parent_id   uuid        REFERENCES categories(id),
  image_url   text,
  icon        text,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE brands (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  slug       text        UNIQUE NOT NULL,
  logo_url   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Source
  source_platform         text,         -- 'alibaba' | 'aliexpress' | 'shein' | 'manual'
  source_url              text,
  source_id               text,         -- platform's own product ID
  -- Content
  name                    text          NOT NULL,
  slug                    text          UNIQUE NOT NULL,
  description             text,
  brand_id                uuid          REFERENCES brands(id),
  category_id             uuid          NOT NULL REFERENCES categories(id),
  tags                    text[]        NOT NULL DEFAULT '{}',
  images                  text[]        NOT NULL DEFAULT '{}', -- CDN URLs, ordered
  -- Pricing (all KES cents unless stated)
  source_price_usd_cents  bigint        NOT NULL DEFAULT 0,
  markup_pct              numeric(5,2)  NOT NULL DEFAULT 5,    -- overrides global default
  shipping_fee_kes_cents  bigint        NOT NULL DEFAULT 0,
  tax_kes_cents           bigint        NOT NULL DEFAULT 0,
  sell_price_kes_cents    bigint        NOT NULL DEFAULT 0,    -- final customer price
  -- Variants
  has_variants            boolean       NOT NULL DEFAULT false,
  -- Inventory
  stock_status            text          NOT NULL DEFAULT 'in_stock',
  -- Stats
  view_count              integer       NOT NULL DEFAULT 0,
  order_count             integer       NOT NULL DEFAULT 0,
  rating                  numeric(3,1),
  review_count            integer       NOT NULL DEFAULT 0,
  -- Flags
  is_active               boolean       NOT NULL DEFAULT true,
  is_featured             boolean       NOT NULL DEFAULT false,
  -- Delivery estimates (business days)
  estimated_days_min      integer       NOT NULL DEFAULT 7,
  estimated_days_max      integer       NOT NULL DEFAULT 14,
  -- Timestamps
  last_scraped_at         timestamptz,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now()
);

-- Full-text search vector, auto-maintained by Postgres
ALTER TABLE products
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      array_to_string(tags, ' ')
    )
  ) STORED;

CREATE TABLE product_variants (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attributes            jsonb       NOT NULL DEFAULT '{}', -- e.g. {"size":"XL","color":"Red"}
  sku                   text,
  price_delta_kes_cents bigint      NOT NULL DEFAULT 0,    -- added on top of sell_price
  stock_qty             integer     NOT NULL DEFAULT 0,
  image_url             text,
  is_active             boolean     NOT NULL DEFAULT true,
  sort_order            integer     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ── PRICING CONFIG ───────────────────────────────────────────────────────────

CREATE TABLE pricing_config (
  key        text        PRIMARY KEY,
  value      text        NOT NULL,
  label      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── SHIPPING RATES ───────────────────────────────────────────────────────────

CREATE TABLE shipping_rates (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  weight_min_g   integer     NOT NULL,
  weight_max_g   integer     NOT NULL,
  fee_kes_cents  bigint      NOT NULL,
  est_days_min   integer     NOT NULL DEFAULT 7,
  est_days_max   integer     NOT NULL DEFAULT 14,
  is_active      boolean     NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now()
);

-- ── CART ─────────────────────────────────────────────────────────────────────

CREATE TABLE carts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  session_id text,       -- for guest carts (no account yet)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id              uuid        NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id           uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id           uuid        REFERENCES product_variants(id),
  qty                  integer     NOT NULL DEFAULT 1 CHECK (qty > 0),
  price_snapshot_cents bigint      NOT NULL, -- locked at time of add
  added_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, product_id, variant_id)
);

-- ── WISHLISTS ────────────────────────────────────────────────────────────────

CREATE TABLE wishlist_items (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

-- ── DELIVERY ADDRESSES ───────────────────────────────────────────────────────

CREATE TABLE delivery_addresses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        text        NOT NULL DEFAULT 'Home',
  full_name    text        NOT NULL,
  phone        text        NOT NULL,
  county       text        NOT NULL,
  town         text        NOT NULL,
  address_line text        NOT NULL,
  is_default   boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── ORDERS ───────────────────────────────────────────────────────────────────

CREATE SEQUENCE order_number_seq START 1;

CREATE TABLE orders (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid         NOT NULL REFERENCES users(id),
  order_number          text         UNIQUE NOT NULL
                                     DEFAULT 'THP-' || to_char(now(), 'YYYY') || '-' ||
                                             lpad(nextval('order_number_seq')::text, 5, '0'),
  status                order_status NOT NULL DEFAULT 'pending_payment',
  -- Delivery
  delivery_address_id   uuid         REFERENCES delivery_addresses(id),
  delivery_address_snap jsonb,       -- snapshot at order time
  estimated_delivery_at date,
  delivered_at          timestamptz,
  -- Pricing (KES cents)
  subtotal_cents        bigint       NOT NULL DEFAULT 0,
  shipping_cents        bigint       NOT NULL DEFAULT 0,
  tax_cents             bigint       NOT NULL DEFAULT 0,
  discount_cents        bigint       NOT NULL DEFAULT 0,
  total_cents           bigint       NOT NULL,
  -- Payment
  payment_method        text,        -- 'mpesa' | 'card'
  payment_ref           text,        -- M-Pesa ref or Stripe charge ID
  paid_at               timestamptz,
  -- Tracking
  tracking_number       text,
  -- Coupon applied
  promotion_id          uuid,
  notes                 text,
  -- Timestamps
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id          uuid        NOT NULL REFERENCES products(id),
  variant_id          uuid        REFERENCES product_variants(id),
  -- Snapshots (immutable record of what was sold)
  product_name_snap   text        NOT NULL,
  product_image_snap  text,
  variant_attrs_snap  jsonb,
  qty                 integer     NOT NULL DEFAULT 1,
  unit_price_cents    bigint      NOT NULL,
  total_cents         bigint      NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── REVIEWS ──────────────────────────────────────────────────────────────────

CREATE TABLE reviews (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id     uuid          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_id       uuid          REFERENCES orders(id),
  order_item_id  uuid          REFERENCES order_items(id),
  rating         integer       NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title          text,
  body           text,
  images         text[]        NOT NULL DEFAULT '{}',
  helpful_count  integer       NOT NULL DEFAULT 0,
  status         review_status NOT NULL DEFAULT 'pending',
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_item_id)  -- one review per purchased line item
);

-- ── IMPORT JOBS (scraping) ────────────────────────────────────────────────────

CREATE TABLE import_jobs (
  id              uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform text               NOT NULL,   -- 'alibaba' | 'aliexpress' | 'shein' | 'manual'
  source_url      text,                          -- single product URL, or null for search
  search_query    text,                          -- used when scraping a search results page
  category_id     uuid               REFERENCES categories(id),
  status          import_job_status  NOT NULL DEFAULT 'queued',
  products_found  integer            NOT NULL DEFAULT 0,
  products_added  integer            NOT NULL DEFAULT 0,
  error_message   text,
  result          jsonb,
  scheduled_at    timestamptz,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_by      uuid               REFERENCES users(id),
  created_at      timestamptz        NOT NULL DEFAULT now()
);

-- ── NOTIFICATIONS ────────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text        NOT NULL,  -- 'order_confirmed' | 'order_shipped' | 'price_drop' | etc.
  title      text        NOT NULL,
  body       text        NOT NULL,
  data       jsonb,                 -- e.g. {"order_id":"...", "product_id":"..."}
  read_at    timestamptz,
  sent_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_logs (
  id           bigserial   PRIMARY KEY,
  to_email     text        NOT NULL,
  template     text        NOT NULL,
  subject      text        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending',
  provider_ref text,       -- Gmail message ID
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── REFERRALS ────────────────────────────────────────────────────────────────

CREATE TABLE referrals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid        NOT NULL REFERENCES users(id),
  referee_id  uuid        NOT NULL REFERENCES users(id),
  rewarded_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referrer_id, referee_id)
);

-- ── PROMOTIONS / COUPONS ─────────────────────────────────────────────────────

CREATE TABLE promotions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text        UNIQUE NOT NULL,
  type            text        NOT NULL,       -- 'percentage' | 'fixed_kes'
  value           bigint      NOT NULL,       -- pct * 100 or KES cents
  min_order_cents bigint      NOT NULL DEFAULT 0,
  max_uses        integer,
  use_count       integer     NOT NULL DEFAULT 0,
  valid_from      timestamptz NOT NULL,
  valid_to        timestamptz NOT NULL,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── SUPPORT TICKETS ──────────────────────────────────────────────────────────

CREATE TABLE tickets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id   uuid        REFERENCES orders(id),
  subject    text        NOT NULL,
  status     text        NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ticket_messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  uuid        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id  uuid        REFERENCES users(id),
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── EXCHANGE RATES ───────────────────────────────────────────────────────────

CREATE TABLE exchange_rates (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  base           text         NOT NULL,  -- 'USD'
  quote          text         NOT NULL,  -- 'KES'
  rate           numeric(12,4) NOT NULL,
  source         text,
  effective_from timestamptz  NOT NULL DEFAULT now()
);

-- ── ADMIN LOGS ───────────────────────────────────────────────────────────────

CREATE TABLE admin_logs (
  id         bigserial   PRIMARY KEY,
  actor_id   uuid        REFERENCES users(id),
  action     text        NOT NULL,
  entity     text,
  entity_id  text,
  meta       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── INDEXES ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_products_category  ON products(category_id);
CREATE INDEX idx_products_slug      ON products(slug);
CREATE INDEX idx_products_active    ON products(is_active);
CREATE INDEX idx_products_featured  ON products(is_featured);
CREATE INDEX idx_products_source    ON products(source_platform, source_id);
CREATE INDEX idx_products_tags      ON products USING GIN(tags);
CREATE INDEX idx_products_fts       ON products USING GIN(search_vector);
CREATE INDEX idx_variants_product   ON product_variants(product_id);
CREATE INDEX idx_cart_items_cart    ON cart_items(cart_id);
CREATE INDEX idx_wishlist_user      ON wishlist_items(user_id);
CREATE INDEX idx_orders_user        ON orders(user_id);
CREATE INDEX idx_orders_status      ON orders(status);
CREATE INDEX idx_order_items_order  ON order_items(order_id);
CREATE INDEX idx_reviews_product    ON reviews(product_id, status);
CREATE INDEX idx_reviews_user       ON reviews(user_id);
CREATE INDEX idx_import_jobs_status ON import_jobs(status);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX idx_addresses_user     ON delivery_addresses(user_id);
