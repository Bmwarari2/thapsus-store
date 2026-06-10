# Thapsus Store — API Specification

> **Base URL (dev):** `http://localhost:4000`
> **Base URL (prod):** `https://thapsus.uk` (API + SPA share one origin)
> All endpoints are prefixed with **`/api/v1`**

---

## Conventions

### Authentication
Pass a JWT obtained from `/api/v1/auth/login` or `/api/v1/auth/signup` as a Bearer token:

```
Authorization: Bearer <token>
```

Tokens expire after **7 days**.

### Response envelope

```jsonc
// Success
{ "ok": true, "data": { ... } }

// Error
{ "ok": false, "error": { "code": "machine_code", "message": "Human-readable", "details": { } } }
```

### Currency
All prices are stored and returned as **KES cents** (integer bigint). Divide by 100 for display.

**Pricing model v2 (tax-inclusive):** item prices = `source × fx × (1 + 2% FX buffer) × (1 + markup) × (1 + duty) × (1 + VAT)`, rounded up to the nearest KES 10. Item prices never include freight. Delivery is one per-order fee computed from the cart's total weight against the `shipping_rates` tiers, charged at checkout.

### Rate limits
General `/api/v1`: 200 req / 15 min. Auth routes: 20 req / 15 min. `POST /payments/mpesa/initiate`: 5 req / min.

---

## Public catalog

The public product shape (`PublicProduct`) deliberately excludes source price, markup, source URL/id/platform, and weight — those fields exist only on `/admin` responses.

| Method | Path | Notes |
|---|---|---|
| GET | `/products/feed` | **Infinite-scroll feed.** Params: `limit` (≤48, default 24), `cursor` (opaque — pass back `nextCursor`), `sort` (`newest` \| `popular` \| `price_asc` \| `price_desc`), `category`, `q`, `min_price`, `max_price` (KES). Returns `{ items: PublicProduct[], nextCursor: string \| null }`. No total count. |
| GET | `/products` | Offset pagination (admin tables / legacy). Adds `min_rating`, `featured`, `page`. Returns `{ products, total }`. |
| GET | `/products/featured` | Up to 12 featured products. |
| GET | `/products/:slug` | `{ product, variants, reviews }`. Serving a product whose source data is >24 h old enqueues a deduped background refresh. |
| GET | `/products/:id/reviews` | Paginated approved reviews. |
| GET | `/categories` | Category tree (flat list with `parentId`). |
| GET | `/search?q=` | FTS search. `/search/suggestions?q=` for typeahead. |

## Auth

| Method | Path |
|---|---|
| POST | `/auth/signup` `{ email, password, fullName, phone?, referralCode? }` |
| POST | `/auth/login` `{ email, password }` |
| POST | `/auth/forgot-password`, `/auth/reset-password` |

## Cart (auth required)

| Method | Path |
|---|---|
| GET | `/cart` |
| POST | `/cart/items` `{ productId, variantId?, qty }` |
| PATCH | `/cart/items/:id` `{ qty }` |
| DELETE | `/cart/items/:id`, `/cart` |
| POST | `/cart/merge` |

## Checkout: quote → order → pay (auth required)

1. **`POST /orders/quote`** `{ promotionCode? }`
   Server-prices the cart: live item prices, delivery from Σ(weight × qty) against `shipping_rates`, promotion validated (not consumed). Unavailable lines are excluded and reported in `warnings`. Persists a quote with a **30-minute TTL**.
   Returns `{ quoteId, expiresAt, lines, itemsCents, deliveryCents, dutyCents, vatCents, discountCents, totalCents, totalWeightGrams, estimatedDelivery, warnings }`.
   In tax-inclusive mode `dutyCents`/`vatCents` are 0 (already inside item prices).

2. **`POST /orders`** `{ quoteId, deliveryAddressId, paymentMethod: "mpesa", notes? }`
   Header: `Idempotency-Key: <uuid>` — replays return the original order (`replayed: true`).
   Totals come **only** from the unexpired quote. Item-price drift >2% since the quote → `409 quote_stale`; expired quote → `409 quote_expired` (client re-quotes).
   Does **not** clear the cart or consume the promotion.

3. **`POST /payments/mpesa/initiate`** `{ orderId, phone }`
   Owner-checked. `phone` accepts `07…`, `01…`, `+254…`, `254…` and is normalized to `2547XXXXXXXX`; invalid numbers → `400 invalid_phone`. Sends the STK push; stores the `CheckoutRequestID`.

4. **`GET /orders/:id/payment-status`** → `{ status: "pending" | "paid" | "cancelled", paidAt, paymentRef }` — poll every ~3 s while the customer confirms on their phone.

**Callback** (`POST /payments/mpesa/callback/:token`, public): guarded by the secret `MPESA_CALLBACK_TOKEN` path segment. A success callback flips the order to `payment_confirmed` only after (a) the paid amount matches the order total and (b) a Daraja STK Push status query confirms the transaction. On confirmation the cart is cleared, the promotion's `use_count` is incremented, product order counts update, and the confirmation email/notification go out. Anomalies are written to `admin_logs` (`mpesa_amount_mismatch`, `mpesa_query_unconfirmed`, `mpesa_query_failed`) and the order stays pending.

## Orders (auth required)

| Method | Path |
|---|---|
| GET | `/orders` — paginated own orders |
| GET | `/orders/:id` — `{ order, items }` (order carries `dutyCents`, `vatCents` lines) |
| POST | `/orders/:id/cancel` — only while `pending_payment` |

## Customer (`/me`, auth required)

Profile, delivery addresses (CRUD), wishlist, notifications, support tickets — see `routes/customer.ts`.

## Reviews (auth required)

`POST /reviews` — purchase-gated (`orderItemId` must belong to the caller); one review per order item.

## Admin (`/admin`, admin role required)

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/products` | Full product shape incl. `sourcePriceUsdCents`, `markupPct`, `sourceUrl`, `weightGrams`, `weightSource`. |
| POST/PATCH | `/admin/products(/:id)` | Setting `weightGrams` marks `weight_source = 'manual'` (scrapes won't overwrite it). Price recomputed via the v2 engine when source price / markup changes. |
| POST | `/admin/products/reprice-all` | Single set-based v2 reprice. No-op at unchanged rates. |
| GET/POST | `/admin/import-jobs` | Platforms: `aliexpress`, `shein` (Alibaba dropped). `maxProducts` (1–96) caps search imports; defaults to `search_import_max_products`. |
| GET | `/admin/scrape-budget` | `{ usedToday, dailyBudget }` from the `scrape_calls` ledger. |
| GET/PATCH | `/admin/pricing-config` | Knobs: `default_markup_pct` (20), `fx_buffer_pct` (2), `import_duty_pct` (25), `vat_pct` (16), `price_round_to_kes` (10), `tax_inclusive_pricing` (true), `scrape_daily_budget`, `search_import_max_products`, `scheduled_search_query`. |
| GET | `/admin/analytics` | Revenue counts **paid orders only** (`paid_at IS NOT NULL`). |
| GET/PATCH | `/admin/orders`, `/admin/reviews` | Order status transitions trigger notifications + emails. |

## Worker (no HTTP API)

BullMQ queue `imports`, jobs:
- `import-product` `{ jobId }` — processes an `import_jobs` row. Every Oxylabs call is logged to `scrape_calls` and blocked past `scrape_daily_budget`.
- `refresh-product` `{ productId }` — single-product self-heal, enqueued by the API for stale PDPs (deduped via jobId).
- `exchange-rate` — daily 02:00 EAT; updates rates then runs the shared set-based reprice.

A sweep on boot + every 10 min re-enqueues `import_jobs` rows stuck in `queued` (e.g. the API failed to reach Redis).

## Environment

See `.env.local.example`. Notable: `JWT_SECRET` and `WEB_BASE_URL` are **required in production** (boot failure otherwise); `MPESA_ENV` selects sandbox vs production Daraja; `MPESA_CALLBACK_TOKEN` is appended to `MPESA_CALLBACK_URL` as the callback's secret path segment. Canonical domain: **thapsus.uk** (`cdn.thapsus.uk` for R2 images).
