# Thapsus Store — API Specification

> **Base URL (dev):** `http://localhost:3001`  
> **Base URL (prod):** `https://api.thapsus.co.ke`  
> All endpoints are prefixed with `/api`

---

## Conventions

### Authentication
Pass a JWT obtained from `/api/auth/login` or `/api/auth/signup` as a Bearer token:
```
Authorization: Bearer <token>
```
Tokens do not expire by design (long-lived). Re-login to rotate.

### Response Envelope
Every response is wrapped:
```jsonc
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": "Human-readable message" }
```

### Pagination
List endpoints that paginate return:
```jsonc
{
  "success": true,
  "data": {
    "items": [...],
    "meta": {
      "total": 142,
      "page": 1,
      "limit": 24,
      "pages": 6
    }
  }
}
```

### Currency
All prices are stored and returned as **KES cents** (integer).  
Display: divide by 100 → format as `KES X,XXX`.

### Error Codes
| HTTP | Meaning |
|------|---------|
| 400 | Validation failed — `error` contains a readable message |
| 401 | Missing or invalid JWT |
| 403 | Authenticated but not authorized (e.g., non-admin hitting admin route) |
| 404 | Resource not found |
| 409 | Conflict (duplicate email, slug, etc.) |
| 500 | Internal server error |

---

## Auth — `/api/auth`

### POST `/api/auth/signup`
Create a new customer account.

**Body:**
```jsonc
{
  "name": "Jane Doe",           // required, 2–80 chars
  "email": "jane@example.com",  // required, valid email
  "password": "secret123",      // required, min 8 chars
  "referralCode": "BRIAN20"     // optional
}
```

**Response `201`:**
```jsonc
{
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "role": "customer",
    "createdAt": "2026-06-08T10:00:00Z"
  }
}
```

**Side effects:** Sends welcome email via Gmail OAuth.

---

### POST `/api/auth/login`
```jsonc
// Body
{ "email": "jane@example.com", "password": "secret123" }

// Response 200
{ "token": "<jwt>", "user": { ...same shape as signup... } }
```
Returns `401` on wrong credentials (intentionally vague — no email enumeration).

---

### POST `/api/auth/forgot-password`
```jsonc
// Body
{ "email": "jane@example.com" }

// Response 200 (always — never reveals whether email exists)
{ "message": "If that email exists, a reset link has been sent." }
```
Sends a reset link to the email with a 1-hour expiry token.

---

### POST `/api/auth/reset-password`
```jsonc
// Body
{ "token": "<raw-token-from-email>", "password": "newpassword123" }

// Response 200
{ "message": "Password updated." }
```

---

### GET `/api/auth/me` *(auth required)*
Returns the current user's profile.
```jsonc
// Response 200
{
  "id": "uuid",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "role": "customer",
  "referralCode": "JANE5X",
  "createdAt": "2026-06-08T10:00:00Z"
}
```

---

## Products — `/api/products`

### GET `/api/products`
Browse/filter the product catalogue.

**Query params:**
| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `q` | string | — | Full-text search |
| `category` | string | — | Category slug |
| `brand` | string | — | Brand slug |
| `minPrice` | number | — | KES cents |
| `maxPrice` | number | — | KES cents |
| `sort` | string | `popular` | `popular \| price_asc \| price_desc \| newest` |
| `page` | number | `1` | |
| `limit` | number | `24` | Max `96` |

**Response `200`:**
```jsonc
{
  "items": [ { ...Product }, ... ],
  "meta": { "total": 240, "page": 1, "limit": 24, "pages": 10 }
}
```

---

### GET `/api/products/featured`
Returns up to 12 featured products (is_featured = true, sorted by view_count).
```jsonc
// Response 200
{ "items": [ { ...Product }, ... ] }
```

---

### GET `/api/products/categories`
Full category tree.
```jsonc
// Response 200
{
  "items": [
    {
      "id": "uuid",
      "name": "Women's Fashion",
      "slug": "womens-fashion",
      "icon": "👗",
      "description": "...",
      "children": [
        { "id": "uuid", "name": "Dresses", "slug": "dresses", "parentId": "uuid" }
      ]
    }
  ]
}
```

---

### GET `/api/products/:slug`
Single product with variants and review summary.

**Response `200`:**
```jsonc
{
  "id": "uuid",
  "name": "Floral Midi Dress",
  "slug": "floral-midi-dress-a1b2",
  "description": "...",
  "category": { "id": "uuid", "name": "Dresses", "slug": "dresses" },
  "brand": { "id": "uuid", "name": "SHEIN" } | null,
  "tags": ["floral", "midi", "summer"],
  "images": ["https://cdn.thapsus.co.ke/products/...jpg"],
  "sourcePlatform": "shein",
  "sourceUrl": "https://www.shein.com/...",
  "sourcePriceUsdCents": 1299,
  "sellPriceKesCents": 3200,
  "shippingFeeKesCents": 850,
  "taxKesCents": 480,
  "hasVariants": true,
  "estimatedDaysMin": 7,
  "estimatedDaysMax": 14,
  "ratingAvg": 4.3,
  "ratingCount": 28,
  "viewCount": 412,
  "isFeatured": false,
  "variants": [
    {
      "id": "uuid",
      "attributes": { "Color": "Red", "Size": "M" },
      "priceDeltaKesCents": 0,
      "imageUrl": "https://cdn.thapsus.co.ke/...",
      "stockStatus": "in_stock",
      "sortOrder": 0
    }
  ],
  "reviewsSummary": {
    "avg": 4.3,
    "count": 28,
    "distribution": { "5": 14, "4": 8, "3": 4, "2": 1, "1": 1 }
  },
  "createdAt": "2026-06-01T00:00:00Z"
}
```

---

### GET `/api/products/:id/reviews`
Paginated reviews for a product.

**Query:** `page`, `limit` (default 10)

**Response `200`:**
```jsonc
{
  "items": [
    {
      "id": "uuid",
      "rating": 5,
      "title": "Great quality!",
      "body": "Exactly as described...",
      "images": [],
      "reviewerName": "Jane D.",
      "createdAt": "2026-06-05T12:00:00Z"
    }
  ],
  "meta": { "total": 28, "page": 1, "limit": 10, "pages": 3 }
}
```

---

## Search — `/api/search`

### GET `/api/search`
Full-text search using PostgreSQL `tsvector`.

**Query:** `q` (required), `page`, `limit`

**Response `200`:** Same shape as `GET /api/products` but scoped to search results.

---

### GET `/api/search/suggestions`
Fast typeahead for the search bar.

**Query:** `q` (required, min 2 chars)

**Response `200`:**
```jsonc
{ "suggestions": ["floral dress", "floral top", "floral skirt"] }
```

---

## Cart — `/api/cart`

Cart is keyed by either:
- JWT user ID (authenticated)
- `guestCartId` UUID stored in localStorage (anonymous)

For guest carts, pass the ID as a query param: `?guestCartId=<uuid>`.

### GET `/api/cart`
```jsonc
// Response 200
{
  "id": "uuid",
  "items": [
    {
      "id": "uuid",
      "productId": "uuid",
      "variantId": "uuid" | null,
      "quantity": 2,
      "product": {
        "name": "Floral Midi Dress",
        "slug": "floral-midi-dress-a1b2",
        "images": ["https://..."],
        "sellPriceKesCents": 3200
      },
      "variant": { "attributes": { "Color": "Red", "Size": "M" }, "priceDeltaKesCents": 0 } | null,
      "linePriceKesCents": 6400
    }
  ],
  "subtotalKesCents": 6400,
  "itemCount": 2
}
```

---

### POST `/api/cart/items`
Add a product to the cart. If the item already exists, quantity is incremented.
```jsonc
// Body
{
  "productId": "uuid",    // required
  "variantId": "uuid",    // required if product has variants
  "quantity": 1           // default 1
}
// Response 200: full cart (same shape as GET /api/cart)
```

---

### PATCH `/api/cart/items/:id`
```jsonc
// Body — set exact quantity (0 = remove)
{ "quantity": 3 }
// Response 200: full cart
```

---

### DELETE `/api/cart/items/:id`
Remove a single cart line.
```jsonc
// Response 200: full cart
```

---

### POST `/api/cart/merge` *(auth required)*
Merges a guest cart into the authenticated user's cart (called after login).
```jsonc
// Body
{ "guestCartId": "uuid" }
// Response 200: merged cart
```

---

## Orders — `/api/orders`

### POST `/api/orders` *(auth required)*
Place an order from the current cart.

**Body:**
```jsonc
{
  "addressId": "uuid",     // required — must belong to user
  "promoCode": "SAVE10",   // optional
  "notes": "Leave at door" // optional
}
```

**Response `201`:**
```jsonc
{
  "id": "uuid",
  "orderNumber": "THX-20260608-00042",
  "status": "pending_payment",
  "totalKesCents": 7680,
  "subtotalKesCents": 6400,
  "discountKesCents": 0,
  "items": [...],
  "deliveryAddress": { ... },
  "createdAt": "2026-06-08T10:00:00Z"
}
```

**Side effects:** Sends order confirmation email. Clears the cart.

> **Price validation:** The API re-checks current prices at order time. If any item drifted more than 5% from the cart snapshot, the order is rejected with a `409` containing updated prices for the UI to refresh.

---

### GET `/api/orders` *(auth required)*
Customer's order history.

**Query:** `page`, `limit` (default 10)

```jsonc
// Response 200
{
  "items": [
    {
      "id": "uuid",
      "orderNumber": "THX-20260608-00042",
      "status": "processing",
      "totalKesCents": 7680,
      "itemCount": 2,
      "createdAt": "2026-06-08T10:00:00Z"
    }
  ],
  "meta": { ... }
}
```

---

### GET `/api/orders/:id` *(auth required)*
Full order detail. Only returns orders belonging to the authenticated user.
```jsonc
// Response 200: full order with items, delivery address, payment info
{
  "id": "uuid",
  "orderNumber": "THX-20260608-00042",
  "status": "in_transit",
  "statusLabel": "On the Way",
  "trackingNumber": "KQ123456KE",
  "items": [
    {
      "id": "uuid",
      "productName": "Floral Midi Dress",
      "productSlug": "floral-midi-dress-a1b2",
      "images": ["https://..."],
      "variant": { "Color": "Red", "Size": "M" },
      "quantity": 2,
      "unitPriceKesCents": 3200,
      "linePriceKesCents": 6400
    }
  ],
  "deliveryAddress": {
    "label": "Home",
    "line1": "123 Westlands",
    "city": "Nairobi",
    "county": "Nairobi",
    "phone": "+254712345678"
  },
  "subtotalKesCents": 6400,
  "discountKesCents": 0,
  "totalKesCents": 7680,
  "mpesaReceipt": "QKA12B3C4D",
  "estimatedDelivery": "2026-06-22",
  "createdAt": "2026-06-08T10:00:00Z"
}
```

---

## Payments — `/api/payments`

### POST `/api/payments/mpesa/initiate` *(auth required)*
Trigger an M-Pesa STK push to the customer's phone.
```jsonc
// Body
{ "orderId": "uuid", "phone": "0712345678" }

// Response 200
{ "checkoutRequestId": "ws_CO_...", "message": "Check your phone for the M-Pesa prompt." }
```

---

### POST `/api/payments/mpesa/callback`
Safaricom-facing webhook — **do not call this from the frontend**.  
Verifies payment, updates order status to `payment_confirmed`, stores `MpesaReceiptNumber`.

---

## Reviews — `/api/reviews`

### POST `/api/reviews` *(auth required)*
Submit a product review. The user must have a `delivered` order containing the product.
```jsonc
// Body
{
  "orderItemId": "uuid",  // ties the review to a verified purchase
  "rating": 5,            // 1–5
  "title": "Perfect fit!", // optional, max 100 chars
  "body": "Exactly as shown...", // optional, max 2000 chars
  "images": ["https://..."]      // optional, up to 5
}

// Response 201
{ "id": "uuid", "rating": 5, "status": "pending", "createdAt": "..." }
```
Reviews are `pending` until approved by an admin.

---

## Customer — `/api/customer`

### Delivery Addresses

#### GET `/api/customer/addresses` *(auth)*
```jsonc
// Response 200
{
  "items": [
    {
      "id": "uuid",
      "label": "Home",
      "line1": "123 Westlands Ave",
      "line2": null,
      "city": "Nairobi",
      "county": "Nairobi",
      "phone": "+254712345678",
      "isDefault": true
    }
  ]
}
```

#### POST `/api/customer/addresses` *(auth)*
```jsonc
// Body
{
  "label": "Office",
  "line1": "456 Karen Road",
  "line2": "Suite 5",      // optional
  "city": "Nairobi",
  "county": "Nairobi",
  "phone": "+254712345678",
  "isDefault": false        // optional, default false
}
// Response 201: the created address
```

#### PUT `/api/customer/addresses/:id` *(auth)*
Same body as POST, all fields optional. Returns updated address.

#### DELETE `/api/customer/addresses/:id` *(auth)*
```jsonc
// Response 200
{ "message": "Address deleted." }
```

---

### Wishlist

#### GET `/api/customer/wishlist` *(auth)*
```jsonc
{
  "items": [
    {
      "id": "uuid",
      "productId": "uuid",
      "product": {
        "name": "...",
        "slug": "...",
        "images": ["..."],
        "sellPriceKesCents": 3200,
        "ratingAvg": 4.3
      },
      "addedAt": "2026-06-01T00:00:00Z"
    }
  ]
}
```

#### POST `/api/customer/wishlist` *(auth)*
```jsonc
// Body
{ "productId": "uuid" }
// Response 201: { "id": "uuid", "productId": "uuid" }
// Idempotent — no error if already wishlisted
```

#### DELETE `/api/customer/wishlist/:productId` *(auth)*
```jsonc
// Response 200: { "message": "Removed from wishlist." }
```

---

### Notifications

#### GET `/api/customer/notifications` *(auth)*
```jsonc
{
  "items": [
    {
      "id": "uuid",
      "type": "order_update",
      "title": "Your order is on the way!",
      "body": "THX-20260608-00042 has been shipped.",
      "isRead": false,
      "createdAt": "2026-06-10T08:00:00Z"
    }
  ],
  "unreadCount": 3
}
```

#### PATCH `/api/customer/notifications/:id/read` *(auth)*
```jsonc
// Response 200: { "message": "Marked as read." }
```

#### PATCH `/api/customer/notifications/read-all` *(auth)*
```jsonc
// Response 200: { "message": "All notifications marked as read." }
```

---

### Support Tickets

#### GET `/api/customer/tickets` *(auth)*
```jsonc
{
  "items": [
    {
      "id": "uuid",
      "subject": "Wrong size delivered",
      "status": "open",
      "createdAt": "...",
      "lastReplyAt": "..."
    }
  ]
}
```

#### POST `/api/customer/tickets` *(auth)*
```jsonc
// Body
{ "subject": "Wrong size delivered", "body": "I ordered M but received L..." }
// Response 201: { "id": "uuid", "subject": "...", "status": "open" }
```

#### POST `/api/customer/tickets/:id/reply` *(auth)*
```jsonc
// Body
{ "body": "Please can you check the order?" }
// Response 200: { "message": "Reply sent." }
```

---

## Admin — `/api/admin`

All admin routes require `role: "admin"` on the JWT. Return `403` otherwise.

### Products

#### GET `/api/admin/products`
Full product list including inactive ones. Query: `page`, `limit`, `q`, `platform`.

#### POST `/api/admin/products`
```jsonc
// Body (all required unless noted)
{
  "name": "string",
  "description": "string",       // optional
  "categoryId": "uuid",          // optional
  "brand": "string",             // optional — upserted by name
  "tags": ["string"],
  "images": ["https://..."],
  "sourcePlatform": "shein",     // alibaba | aliexpress | shein
  "sourceUrl": "https://...",
  "sourceId": "string",
  "sourcePriceUsdCents": 1299,
  "weightGrams": 300,
  "estimatedDaysMin": 7,
  "estimatedDaysMax": 14
}
// Response 201: created product
```

#### PUT `/api/admin/products/:id`
Partial update — only provided fields are updated.
```jsonc
// Example: mark as featured
{ "isFeatured": true }
```

#### DELETE `/api/admin/products/:id`
Soft-deletes (sets `is_active = false`). Returns `200`.

---

### Orders

#### GET `/api/admin/orders`
All orders. Query: `page`, `limit`, `status`, `q` (order number / customer name).

#### PATCH `/api/admin/orders/:id/status`
```jsonc
// Body
{
  "status": "shipped",           // see order status enum below
  "trackingNumber": "KQ123456KE", // optional
  "notes": "Dispatched via DHL"  // optional
}
// Response 200: updated order
```

**Side effects:** Sends transactional email to customer + creates in-app notification + logs to `admin_logs`.

**Order status values:**
`pending_payment` → `payment_confirmed` → `processing` → `sourced` → `shipped` → `in_transit` → `customs` → `out_for_delivery` → `delivered`  
Also: `cancelled`, `refunded`

---

### Import Jobs (Scraping)

#### GET `/api/admin/import-jobs`
```jsonc
{
  "items": [
    {
      "id": "uuid",
      "sourcePlatform": "shein",
      "sourceUrl": null,
      "searchQuery": "summer dresses",
      "categoryId": "uuid",
      "status": "done",
      "productsFound": 12,
      "productsAdded": 10,
      "startedAt": "...",
      "finishedAt": "...",
      "errorMessage": null
    }
  ]
}
```

#### POST `/api/admin/import-jobs`
Queue a new scraping job.
```jsonc
// Body
{
  "sourcePlatform": "aliexpress",  // required: alibaba | aliexpress | shein
  "sourceUrl": "https://...",      // one of sourceUrl or searchQuery required
  "searchQuery": "women dress",
  "categoryId": "uuid"             // optional — auto-assigns imported products
}
// Response 201: { "jobId": "uuid", "bullJobId": "123" }
```

---

### Reviews

#### GET `/api/admin/reviews`
Pending reviews awaiting moderation. Query: `status` (default `pending`).

#### PATCH `/api/admin/reviews/:id`
```jsonc
// Body
{ "status": "approved" }  // or "rejected"
// Response 200: updated review
// Side effect on "approved": refreshes product rating_avg + rating_count cache
```

---

### Pricing Config

#### GET `/api/admin/pricing-config`
```jsonc
{
  "markupPct": 5,
  "usdToKesRate": 130,
  "dutyPct": 25,
  "vatPct": 16,
  "baseShippingKes": 500,
  "perKgShippingKes": 800
}
```

#### PUT `/api/admin/pricing-config`
```jsonc
// Body — all fields optional (only provided fields updated)
{ "markupPct": 8 }
// Response 200: full updated config
// Side effect: invalidates in-memory pricing cache (new prices take effect within 5 minutes)
```

---

### Analytics

#### GET `/api/admin/analytics`
Dashboard stats. All monetary values in KES cents.
```jsonc
{
  "revenue": {
    "today": 45000,
    "thisMonth": 1280000,
    "allTime": 8400000
  },
  "orders": {
    "today": 4,
    "thisMonth": 112,
    "allTime": 890,
    "byStatus": [
      { "status": "pending_payment", "count": 8 },
      { "status": "delivered", "count": 720 }
    ]
  },
  "products": {
    "total": 486,
    "active": 460
  },
  "users": {
    "total": 1240,
    "thisMonth": 84
  },
  "topProducts": [
    { "id": "uuid", "name": "Floral Midi Dress", "slug": "...", "revenue": 128000, "orders": 40 }
  ]
}
```

---

## Data Models Reference

### Product (condensed)
```ts
{
  id: string
  name: string
  slug: string
  description: string | null
  category: { id: string; name: string; slug: string } | null
  brand: { id: string; name: string } | null
  tags: string[]
  images: string[]                  // CDN URLs
  sourcePlatform: "alibaba" | "aliexpress" | "shein"
  sourcePriceUsdCents: number
  sellPriceKesCents: number         // what customer pays (all-in)
  shippingFeeKesCents: number
  taxKesCents: number
  hasVariants: boolean
  estimatedDaysMin: number
  estimatedDaysMax: number
  ratingAvg: number | null
  ratingCount: number
  viewCount: number
  isFeatured: boolean
  isActive: boolean
}
```

### Order Status Labels (for UI display)
```ts
{
  pending_payment:    "Awaiting Payment",
  payment_confirmed:  "Payment Confirmed",
  processing:         "Processing",
  sourced:            "Sourced",
  shipped:            "Shipped",
  in_transit:         "On the Way",
  customs:            "Customs Clearance",
  out_for_delivery:   "Out for Delivery",
  delivered:          "Delivered",
  cancelled:          "Cancelled",
  refunded:           "Refunded"
}
```

---

## Environment Variables the Frontend Needs
```
VITE_API_URL=http://localhost:3001/api
VITE_R2_PUBLIC_URL=https://cdn.thapsus.co.ke
```
