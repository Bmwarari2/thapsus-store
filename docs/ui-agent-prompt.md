# Thapsus Store — UI Agent Brief

## Mission

Build the **Thapsus Store** frontend: a Kenya-facing e-commerce web app where customers browse, wishlist, and purchase fashion and lifestyle products sourced from Alibaba, AliExpress, and Shein. Think Shein's energy — bold, fast, deal-forward — but polished for a Kenyan audience (KES pricing, M-Pesa payments, local delivery context).

The backend API is fully built. Your job is the **React frontend only** — wiring up every screen to the REST API documented in `docs/api-spec.md`.

---

## Tech Stack (non-negotiable)

| Layer | Choice |
|-------|--------|
| Framework | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS v3 |
| Routing | React Router v6 (file-based preferred) |
| Data fetching | TanStack Query (React Query v5) |
| Global state | Zustand (cart count, auth token, guest cart ID) |
| Animations | Framer Motion |
| Carousel/Slider | Embla Carousel |
| Toast notifications | React Hot Toast |
| Icons | Lucide React |
| Form validation | React Hook Form + Zod |
| Date formatting | date-fns |

---

## Brand Identity

| Token | Value |
|-------|-------|
| Primary accent | `#E23D44` (Shein-inspired red-pink) |
| Secondary accent | `#FF6B35` (warm orange for sale badges) |
| Background | `#FFFFFF` / `#F8F8F8` |
| Text primary | `#1A1A1A` |
| Text secondary | `#6B7280` |
| Border | `#E5E7EB` |
| Success | `#22C55E` |
| Font | Inter (Google Fonts) |

**Logo:** "Thapsus" in bold weight. The dot on the `a` or a subtle `.ke` suffix as a nod to Kenya.

---

## Design Principles

1. **Mobile-first.** Most Kenyan shoppers are on phones. Design at 375px, scale up gracefully.
2. **Speed-forward.** Skeleton loaders everywhere. No blank white flashes. Images lazy-load.
3. **Deal-forward.** Prices are prominent. Badges (NEW, SALE, LOW STOCK) are visible on every card.
4. **Micro-interactions.** Wishlist heart pulses on toggle. Cart icon bounces on add. Buttons have press states.
5. **Trust signals.** "Secure Checkout", "Genuine Products", "7–14 Day Delivery" shown in appropriate places.
6. **Kenyan context.** All prices in KES (e.g., KES 3,200 — no decimals needed). M-Pesa logo in checkout.

---

## Pages & Routes

### Public (no auth required)

#### `/` — Home
- **Sticky header** (logo, search bar, cart icon with badge, wishlist icon, profile icon)
- **Hero banner carousel** — 3–4 rotating banners (full-width, Framer Motion fade/slide). Sample copy: "New Arrivals Weekly", "Free delivery on orders over KES 5,000", "Pay with M-Pesa"
- **Category quick-nav** — horizontal scrollable pill row with category icons (👗 Women, 👟 Shoes, 💄 Beauty, 🏠 Home…)
- **Flash Deals section** — 4-product horizontal scroll with a countdown timer (next restock)
- **New Arrivals grid** — 8 product cards, "View All" link
- **Featured / Trending** — 2-column masonry-style on mobile, 4-column on desktop
- **App download banner** (placeholder — "Coming soon on mobile")
- **Footer** — links, social icons, trust badges

#### `/products` — Browse / Category
- **Filter sidebar** (desktop: fixed left, mobile: slide-in drawer)
  - Category tree (accordion)
  - Price range slider (KES)
  - Sort dropdown: Popular / Newest / Price ↑ / Price ↓
- **Product grid** — 2 columns mobile, 3 tablet, 4 desktop
- **Infinite scroll** (use IntersectionObserver + TanStack Query `fetchNextPage`)
- URL reflects filters: `/products?category=dresses&sort=price_asc&minPrice=1000`

#### `/search` — Search Results
- Search bar pre-filled with query
- Same grid + filter layout as `/products`
- "No results" state with suggested categories

#### `/products/:slug` — Product Detail
- **Image gallery**: large main image + thumbnail strip (mobile: swipeable via Embla)
- **Image zoom** on desktop hover (CSS transform scale)
- **Product info panel**: name, price (with price breakdown tooltip: source cost → markup → shipping → tax), rating stars, review count
- **Variant selector**: color swatches (circular, with border on selected) + size buttons (pill-shaped). Out-of-stock variants are greyed out, not hidden.
- **Size guide** modal (simple table: S/M/L/XL with cm measurements)
- **Add to Cart** CTA — full-width primary button, bounces on success. Shows "Added!" for 1.5s.
- **Wishlist toggle** — heart icon button, fills red on wishlist
- **Estimated delivery** chip: "Arrives in 7–14 days" with calendar icon
- **Delivery info accordion** — what's included in the price
- **Product description** tab
- **Reviews section**: star distribution bar chart + paginated review cards
- **"You may also like"** — horizontal scroll of related products (same category)

#### `/cart` — Cart Page
- Line items with product thumbnail, name, variant, quantity stepper (−/+), remove button
- Price summary card (subtotal, shipping note, total in KES)
- Promo code input with apply button
- "Proceed to Checkout" CTA
- Empty state with illustration and "Start Shopping" button
- **Cart drawer** (slide-in from right) — also triggered by the header cart icon. Shows a mini cart without leaving current page. "View Cart" and "Checkout" CTAs inside drawer.

#### `/auth/login` and `/auth/signup`
- Clean centered card layout, no distractions
- After login: merge guest cart (`POST /api/cart/merge`), then redirect to previous page or home
- Show/hide password toggle
- Google Sign-In placeholder button (greyed out, "Coming soon")

#### `/auth/forgot-password` and `/auth/reset-password`

---

### Authenticated Routes (redirect to login if no JWT)

#### `/checkout` — Checkout
**Step 1 — Address**
- List of saved addresses (selectable cards with radio)
- "Add new address" expandable form
- Selected address highlighted with accent border

**Step 2 — Review Order**
- Order items summary (non-editable)
- Price breakdown: subtotal, shipping, duty, VAT, total
- Promo code (if not applied in cart)

**Step 3 — Payment**
- M-Pesa logo prominently displayed
- Phone number input (pre-filled from profile)
- "Pay KES X,XXX via M-Pesa" button
- On click: show loading state "Sending prompt to your phone…"
- After STK push: show countdown "Complete payment on your phone within 2 minutes"
- Poll order status every 3 seconds (or use the `checkoutRequestId` to check)
- On success: redirect to `/orders/:id/confirmation`

#### `/orders/confirmation/:id` — Order Confirmation
- Large success checkmark animation (Framer Motion)
- Order number (THX-YYYYMMDD-XXXXX)
- Summary card
- "Track Order" and "Continue Shopping" buttons

#### `/account` — Account Hub (tab layout)
- **Profile** tab: name, email, edit form
- **Orders** tab: paginated order history, each row shows order number, status badge, date, total, "View Details" link
- **Wishlist** tab: product grid (same as browse grid), remove button on each card
- **Addresses** tab: address cards with edit/delete, "Add Address" button
- **Notifications** tab: notification list, mark as read, mark all as read

#### `/orders/:id` — Order Detail
- Order status timeline (vertical stepper) showing all statuses with current one highlighted
- Tracking number (if available)
- Items list with images
- Price breakdown
- Delivery address
- "Need help?" link → support ticket

#### `/tickets` and `/tickets/new` — Support
- Ticket list with status badges
- New ticket form
- Ticket detail with message thread

---

### Admin Routes (requires `role: "admin"` in JWT)

#### `/admin` — Admin Dashboard
- Stats cards: Today's Revenue, Orders Today, Total Products, Active Users
- Orders by status bar chart (Recharts or Chart.js)
- Top products table (last 30 days)

#### `/admin/products` — Product Management
- Data table with search, platform filter
- "Import Products" button → opens import job modal (platform, source URL or search query, category)
- Edit / deactivate per row

#### `/admin/orders` — Order Management
- Data table: order number, customer, status badge, total, date
- Click row → status update modal with dropdown + tracking number field

#### `/admin/reviews` — Review Moderation
- Cards showing review text, rating, product, customer
- Approve / Reject buttons

#### `/admin/pricing` — Pricing Config
- Form fields: Markup %, Exchange Rate, Import Duty %, VAT %
- Live preview: "A product costing $13 → KES X,XXX"

---

## Component Library (build these as reusable components)

### `ProductCard`
```
┌─────────────────┐
│ [Image]    ♡    │  ← wishlist toggle top-right
│         [NEW]   │  ← badge (NEW / SALE / LOW STOCK)
├─────────────────┤
│ Product Name    │
│ ⭐ 4.3 (28)     │
│ KES 3,200       │
│ [+ Add to Cart] │
└─────────────────┘
```
- On hover (desktop): image zooms slightly, quick-add button slides up from bottom
- On mobile: tap image → product detail page

### `ProductGrid`
- Responsive 2/3/4 column grid
- Supports loading skeleton state (show 8 skeleton cards)

### `SkeletonCard`
- Animated shimmer effect (`animate-pulse` + bg-gray-200)

### `CartDrawer`
- Slides in from right (Framer Motion `x` animation)
- Backdrop overlay that closes on click
- Sticky footer with total + checkout button

### `SearchBar`
- Expands on focus (mobile: full-screen overlay)
- Shows `GET /api/search/suggestions` results as a dropdown while typing (debounced 300ms)
- Recent searches stored in localStorage

### `StatusBadge`
- Color-coded pill for order statuses
  - pending_payment: yellow
  - payment_confirmed / processing: blue
  - shipped / in_transit: purple
  - delivered: green
  - cancelled / refunded: red

### `PriceDisplay`
- Shows formatted KES price
- Optional original price (struck through) for items on sale
- Optional "Info" icon that opens a tooltip with price breakdown (source cost, markup, shipping, tax)

### `StarRating`
- Read-only display and interactive input (for review form)

### `VariantSelector`
- Color: circular swatches (uses first image per color variant if available)
- Size: text pills
- Out of stock: greyed + strikethrough

### `OrderTimeline`
- Vertical stepper
- Completed steps: filled circle + green
- Current step: pulsing animation
- Upcoming: grey

### `Toast`
- React Hot Toast configured with Thapsus brand colors
- Positions: bottom-center on mobile, top-right on desktop

---

## Mobile Navigation (bottom tab bar)

```
[ Home ]  [ Categories ]  [ Search ]  [ Cart(3) ]  [ Account ]
   🏠          ▦              🔍         🛒           👤
```

Show on all customer-facing pages. Hide on checkout and admin.

---

## State Management (Zustand)

### `authStore`
```ts
{
  token: string | null
  user: { id, name, email, role } | null
  login(token, user): void
  logout(): void
}
```
Persist to `localStorage`. On app load, re-hydrate and call `GET /api/auth/me` to validate.

### `cartStore`
```ts
{
  guestCartId: string | null          // UUID, generated on first add-to-cart if not logged in
  itemCount: number                   // for header badge
  setItemCount(n): void
  setGuestCartId(id): void
}
```
Actual cart data lives in TanStack Query cache — only the count and guest ID in Zustand.

---

## API Integration Notes

1. **Base URL**: read from `import.meta.env.VITE_API_URL`
2. **JWT**: attach via Axios/Fetch interceptor. On 401, clear auth store and redirect to login.
3. **Guest cart**: send `?guestCartId=<uuid>` on all cart requests when not logged in.
4. **After login**: call `POST /api/cart/merge` with the guestCartId, then clear it.
5. **Optimistic updates**: wishlist toggle and cart quantity changes should update UI instantly and roll back on error.
6. **Price format**: `(kesCents / 100).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 })`

---

## Key UX Flows

### "Add to Cart" happy path
1. User taps "Add to Cart" on product card or detail page
2. If product has variants and none selected → shake the variant selector + show tooltip "Please select a size/color"
3. Optimistically increment cart badge
4. `POST /api/cart/items` in background
5. Cart drawer slides open showing the added item
6. "Added!" state on button for 1.5s, then reset

### Checkout → M-Pesa flow
1. User hits "Place Order" → `POST /api/orders`
2. If 409 (price drift) → show modal "Prices updated" with new totals, offer "Review & Continue"
3. On order created → show M-Pesa form with order total
4. User enters phone → `POST /api/payments/mpesa/initiate`
5. Show: "Check your M-Pesa prompt. You have 2:00 minutes."
6. Poll `GET /api/orders/:id` every 3s for status change to `payment_confirmed`
7. On confirmation → animate to `/orders/confirmation/:id`
8. Timeout after 3 minutes → show "Payment not received. Try again."

### Search
1. User types in search bar
2. After 300ms debounce → `GET /api/search/suggestions?q=...` → dropdown
3. On enter / suggestion click → navigate to `/search?q=...`
4. `/search` page calls `GET /api/search?q=...` with filters
5. Results use same `ProductGrid` + `ProductCard` components

---

## Accessibility & Performance

- All images have descriptive `alt` text
- Focus-visible rings on all interactive elements
- ARIA labels on icon-only buttons (cart, wishlist, close)
- React.lazy + Suspense for route-level code splitting
- Images: use `loading="lazy"` + explicit `width`/`height` to prevent CLS
- Debounce search inputs (300ms)
- Cache product detail pages in TanStack Query for 5 minutes (staleTime: 5 * 60 * 1000)

---

## File Structure Suggestion

```
apps/web/
├── src/
│   ├── components/
│   │   ├── ui/          # primitives: Button, Input, Badge, Modal, Drawer…
│   │   ├── product/     # ProductCard, ProductGrid, VariantSelector, PriceDisplay
│   │   ├── cart/        # CartDrawer, CartItem, CartSummary
│   │   ├── order/       # OrderTimeline, StatusBadge, OrderCard
│   │   ├── layout/      # Header, Footer, BottomNav, AdminSidebar
│   │   └── shared/      # SearchBar, StarRating, SkeletonCard, Toast
│   ├── pages/
│   │   ├── home/
│   │   ├── products/    # browse + detail
│   │   ├── search/
│   │   ├── cart/
│   │   ├── checkout/
│   │   ├── account/
│   │   ├── orders/
│   │   ├── auth/
│   │   └── admin/
│   ├── hooks/           # useCart, useWishlist, useAuth, useInfiniteProducts
│   ├── lib/
│   │   ├── api.ts       # Axios instance + interceptors
│   │   ├── queryClient.ts
│   │   └── utils.ts     # formatKes, formatDate, cn()
│   ├── stores/          # authStore.ts, cartStore.ts
│   └── types/           # re-export from @thapsus/shared or local
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── package.json
```

---

## Environment

```env
VITE_API_URL=http://localhost:3001/api
VITE_R2_PUBLIC_URL=https://cdn.thapsus.uk
```

---

## Deliverables Checklist

- [ ] All public pages (Home, Browse, Product Detail, Search)
- [ ] Auth flow (Signup, Login, Forgot/Reset Password)
- [ ] Cart (drawer + full page) with guest + auth support
- [ ] Checkout (address → review → M-Pesa → confirmation)
- [ ] Account hub (profile, orders, wishlist, addresses, notifications)
- [ ] Order detail with status timeline
- [ ] Admin dashboard (products, orders, reviews, pricing, analytics)
- [ ] Responsive at 375px, 768px, 1280px
- [ ] Loading/skeleton states on all data-fetching views
- [ ] Empty states on all list views
- [ ] Error boundaries with friendly messages
- [ ] Toast notifications for all user actions

---

## API Spec

Full API documentation is in `docs/api-spec.md` in this repository.  
Base URL is set via `VITE_API_URL`.  
All monetary values are **KES cents** — divide by 100 before display.
