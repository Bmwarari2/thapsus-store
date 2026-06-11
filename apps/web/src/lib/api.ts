import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) useAuthStore.getState().logout();
    return Promise.reject(error);
  }
);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  icon: string | null;
  imageUrl: string | null;
  sortOrder: number;
  productCount: number;
  previewImage: string | null;
}

// Mirrors the API's PublicProduct — no cost/markup/source fields exist on the
// public surface.
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  images: string[];
  sellPriceKesCents: number;
  compareAtKesCents: number | null;
  hasVariants: boolean;
  stockStatus: string;
  rating: number | null;
  reviewCount: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  isFeatured: boolean;
  categoryId: string;
  createdAt: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  attributes: Record<string, string>;
  sku: string | null;
  priceDeltaKesCents: number;
  stockQty: number;
  imageUrl: string | null;
  isActive: boolean;
}

export interface CartItem {
  id: string;
  productId: string;
  variantId: string | null;
  qty: number;
  priceSnapshotCents: number;
  productName?: string;
  productSlug?: string;
  productImage?: string;
  variantAttributes?: Record<string, string> | null;
  currentPriceCents?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
}

export interface DeliveryAddress {
  id: string;
  label: string;
  full_name: string;
  phone: string;
  county: string;
  town: string;
  address_line: string;
  is_default: boolean;
}

export interface QuoteLine {
  productId: string;
  variantId: string | null;
  qty: number;
  unitPriceCents: number;
  weightGrams: number;
  nameSnap: string;
  imageSnap: string | null;
  attrsSnap: Record<string, string> | null;
}

export interface OrderQuote {
  quoteId: string;
  expiresAt: string;
  lines: QuoteLine[];
  itemsCents: number;
  deliveryCents: number;
  dutyCents: number;
  vatCents: number;
  discountCents: number;
  totalCents: number;
  totalWeightGrams: number;
  estimatedDelivery: string;
  estDaysMin: number;
  estDaysMax: number;
  warnings: string[];
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  subtotalCents: number;
  shippingCents: number;
  dutyCents: number;
  vatCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: string | null;
  paymentRef: string | null;
  paidAt: string | null;
  deliveryAddressSnap: Record<string, string> | null;
  estimatedDeliveryAt: string | null;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  productNameSnap: string;
  productImageSnap: string | null;
  variantAttrsSnap: Record<string, string> | null;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
}

const unwrap = <T>(res: { data: { data: T } }): T => res.data.data;

// ── Categories ────────────────────────────────────────────────────────────────

export const apiGetCategories = () =>
  api.get('/categories').then(unwrap<Category[]>);

// ── Products ──────────────────────────────────────────────────────────────────

export const apiGetFeaturedProducts = () =>
  api.get('/products/featured').then(unwrap<Product[]>);

export const apiGetProducts = (params: Record<string, string | number | boolean | undefined>) =>
  api.get('/products', { params }).then(unwrap<{ products: Product[]; total: number }>);

export interface FeedPage {
  items: Product[];
  nextCursor: string | null;
}

export const apiGetFeed = (params: Record<string, string | number | undefined>) =>
  api.get('/products/feed', { params }).then(unwrap<FeedPage>);

export const apiGetRelatedProducts = (slug: string, cursor?: string) =>
  api.get(`/products/${slug}/related`, { params: { cursor, limit: 12 } }).then(unwrap<FeedPage>);

// ── Wishlist ──────────────────────────────────────────────────────────────────

export interface WishlistItem {
  id: string;
  created_at: string;
  product_id: string;
  name: string;
  slug: string;
  image: string | null;
  sell_price_kes_cents: number;
  rating: number | null;
  review_count: number;
  stock_status: string;
}

export const apiGetWishlist = () =>
  api.get('/customer/wishlist').then(unwrap<WishlistItem[]>);

export const apiAddToWishlist = (productId: string) =>
  api.post('/customer/wishlist', { productId }).then(unwrap<{ added: boolean }>);

export const apiRemoveFromWishlist = (productId: string) =>
  api.delete(`/customer/wishlist/${productId}`).then(unwrap<{ removed: boolean }>);

export const apiGetProduct = (slug: string) =>
  api.get(`/products/${slug}`).then(unwrap<{
    product: Product;
    variants: ProductVariant[];
    reviews: { items: unknown[]; total: number; avgRating: number | null };
  }>);

// ── Auth ──────────────────────────────────────────────────────────────────────

export const apiLogin = (email: string, password: string) =>
  api.post('/auth/login', { email, password }).then(unwrap<{ user: AuthUser; token: string }>);

export const apiSignup = (fullName: string, email: string, password: string) =>
  api.post('/auth/signup', { fullName, email, password }).then(unwrap<{ user: AuthUser; token: string }>);

// ── Cart ──────────────────────────────────────────────────────────────────────

export const apiGetCart = () =>
  api.get('/cart').then(unwrap<{ cartId: string; items: CartItem[] }>);

export const apiAddToCart = (productId: string, qty: number, variantId?: string) =>
  api.post('/cart/items', { productId, qty, variantId }).then(unwrap<CartItem>);

export const apiUpdateCartItem = (id: string, qty: number) =>
  api.patch(`/cart/items/${id}`, { qty }).then(unwrap<CartItem>);

export const apiRemoveCartItem = (id: string) =>
  api.delete(`/cart/items/${id}`).then(unwrap<{ removed: boolean }>);

// ── Addresses ─────────────────────────────────────────────────────────────────

export const apiGetAddresses = () =>
  api.get('/me/addresses').then(unwrap<DeliveryAddress[]>);

export const apiCreateAddress = (body: {
  label?: string;
  fullName: string;
  phone: string;
  county: string;
  town: string;
  addressLine: string;
  isDefault?: boolean;
}) => api.post('/me/addresses', body).then(unwrap<DeliveryAddress>);

// ── Checkout: quote → order → pay ─────────────────────────────────────────────

export const apiCreateQuote = (promotionCode?: string) =>
  api.post('/orders/quote', { promotionCode }).then(unwrap<OrderQuote>);

export const apiCreateOrder = (body: {
  quoteId: string;
  deliveryAddressId: string;
  paymentMethod: 'mpesa';
  notes?: string;
}, idempotencyKey: string) =>
  api.post('/orders', body, { headers: { 'Idempotency-Key': idempotencyKey } })
    .then(unwrap<{ order: Order; replayed: boolean }>);

export const apiGetOrder = (id: string) =>
  api.get(`/orders/${id}`).then(unwrap<{ order: Order; items: OrderItem[] }>);

export const apiGetMyOrders = (page = 1) =>
  api.get('/orders', { params: { page } }).then(unwrap<{ orders: Order[]; total: number }>);

export const apiInitiateMpesa = (orderId: string, phone: string) =>
  api.post('/payments/mpesa/initiate', { orderId, phone })
    .then(unwrap<{ checkoutRequestId: string }>);

export const apiGetPaymentStatus = (orderId: string) =>
  api.get(`/orders/${orderId}/payment-status`)
    .then(unwrap<{ status: 'paid' | 'pending' | 'cancelled'; paidAt: string | null; paymentRef: string | null }>);

// ── Admin: Purchasing (fulfilment report) ─────────────────────────────────────

export interface PurchasingItem {
  itemId: string;
  name: string;
  image: string | null;
  attrs: Record<string, string> | null;
  qty: number;
  unitPriceCents: number;
  purchasedAt: string | null;
  sourcePlatform: string | null;
  sourceUrl: string | null;
  sourcePriceCents: number;
  sourceCurrency: string;
}

export interface PurchasingOrder {
  orderId: string;
  orderNumber: string;
  paidAt: string;
  orderStatus: string;
  customerName: string | null;
  items: PurchasingItem[];
}

export const apiGetPurchasing = (includeDone = false) =>
  api.get('/admin/purchasing', { params: { include_done: includeDone } })
    .then(unwrap<PurchasingOrder[]>);

export const apiMarkPurchased = (itemId: string, purchased: boolean) =>
  api.patch(`/admin/purchasing/items/${itemId}`, { purchased })
    .then(unwrap<{ itemId: string; purchased: boolean; orderAdvanced: boolean }>);

// ── Admin: Products ───────────────────────────────────────────────────────────

// Mirrors the API's full (admin-only) Product shape — includes cost basis and
// source fields that PublicProduct deliberately hides.
export interface AdminProduct {
  id: string;
  sourcePlatform: string | null;
  sourceUrl: string | null;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  images: string[];
  sourcePriceUsdCents: number;
  sourceCurrency: string;
  markupPct: number;
  sellPriceKesCents: number;
  compareAtKesCents: number | null;
  weightGrams: number;
  hasVariants: boolean;
  stockStatus: string;
  isActive: boolean;
  isFeatured: boolean;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  lastScrapedAt: string | null;
  createdAt: string;
}

export const apiAdminGetProducts = (params: {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  active?: 'all';
}) =>
  api.get('/admin/products', { params })
    .then(unwrap<{ products: AdminProduct[]; total: number }>);

export interface AdminProductUpdate {
  name?: string;
  description?: string;
  categoryId?: string;
  sourcePriceUsdCents?: number;
  markupPct?: number;
  weightGrams?: number;
  estimatedDaysMin?: number;
  estimatedDaysMax?: number;
  isActive?: boolean;
}

// Changing sourcePriceUsdCents or markupPct recomputes the sell price
// server-side under the live pricing config.
export const apiAdminUpdateProduct = (id: string, body: AdminProductUpdate) =>
  api.patch(`/admin/products/${id}`, body).then(unwrap<AdminProduct>);

export const apiAdminRepriceAll = () =>
  api.post('/admin/products/reprice-all').then(unwrap<{ updated: number }>);

// Hard delete when never ordered; otherwise the API deactivates instead.
export const apiAdminDeleteProduct = (id: string) =>
  api.delete(`/admin/products/${id}`, { params: { hard: 'true' } })
    .then(unwrap<{ deleted: boolean; deactivated?: boolean }>);

// ── Admin: Orders ─────────────────────────────────────────────────────────────

export interface AdminOrder {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string | null;
  customerEmail: string | null;
  status: string;
  totalCents: number;
  paidAt: string | null;
  trackingNumber: string | null;
  createdAt: string;
  deliveryAddressSnap: Record<string, unknown> | null;
}

export interface AdminOrderItem {
  id: string;
  productId: string;
  productNameSnap: string;
  productImageSnap: string | null;
  variantAttrsSnap: Record<string, string> | null;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
}

export const apiAdminGetOrders = (params: { status?: string; user?: string; page?: number }) =>
  api.get('/admin/orders', { params }).then(unwrap<{ orders: AdminOrder[]; total: number }>);

export const apiAdminGetOrder = (id: string) =>
  api.get(`/admin/orders/${id}`).then(unwrap<{
    order: AdminOrder;
    items: AdminOrderItem[];
    customer: { full_name: string | null; email: string; phone: string | null } | null;
  }>);

export const apiAdminUpdateOrderStatus = (id: string, body: { status: string; trackingNumber?: string; note?: string }) =>
  api.patch(`/admin/orders/${id}/status`, body).then(unwrap<AdminOrder>);

// ── Admin: Customers ──────────────────────────────────────────────────────────

export interface AdminCustomer {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  created_at: string;
  is_active: boolean;
  order_count: number;
  total_spent_cents: number;
  last_order_at: string | null;
}

export const apiAdminGetCustomers = (params: { q?: string; page?: number }) =>
  api.get('/admin/customers', { params }).then(unwrap<{ customers: AdminCustomer[]; total: number }>);

// ── Admin: Reviews ────────────────────────────────────────────────────────────

export interface AdminReview {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  title: string | null;
  body: string | null;
  images: string[];
  status: string;
  createdAt: string;
}

export const apiAdminGetReviews = (page = 1) =>
  api.get('/admin/reviews', { params: { page } }).then(unwrap<{ reviews: AdminReview[]; total: number }>);

export const apiAdminModerateReview = (id: string, status: 'approved' | 'rejected') =>
  api.patch(`/admin/reviews/${id}`, { status }).then(unwrap<AdminReview>);

// ── Admin: Analytics / Pricing config ─────────────────────────────────────────

export interface AdminAnalytics {
  revenue: { today: string | null; week: string | null; month: string | null; all_time: string | null };
  orderCounts: Record<string, number>;
  topProducts: Array<{ id: string; name: string; slug: string; image: string | null; units_sold: number; revenue_cents: string }>;
  recentOrders: Array<{ id: string; order_number: string; status: string; total_cents: string; created_at: string; customer_name: string | null }>;
}

export const apiAdminGetAnalytics = () =>
  api.get('/admin/analytics').then(unwrap<AdminAnalytics>);

export interface PricingConfigRow {
  key: string;
  value: string;
  label: string | null;
  updated_at: string;
}

export const apiAdminGetPricingConfig = () =>
  api.get('/admin/pricing-config').then(unwrap<PricingConfigRow[]>);

export const apiAdminUpdatePricingConfig = (updates: Record<string, string>) =>
  api.patch('/admin/pricing-config', updates).then(unwrap<{ updated: number }>);

export interface HsTaxCategory {
  id: string;
  code: string;
  name: string;
  duty_pct: string;
  vat_pct: string;
  excise_pct: string;
  notes: string | null;
  products_pinned: number;
}

export const apiAdminGetHsTaxCategories = () =>
  api.get('/admin/hs-tax-categories').then(unwrap<HsTaxCategory[]>);

export const apiAdminUpdateHsTaxCategory = (code: string, body: { dutyPct?: number; vatPct?: number; excisePct?: number }) =>
  api.patch(`/admin/hs-tax-categories/${encodeURIComponent(code)}`, body).then(unwrap<HsTaxCategory>);

// ── Admin: Import Jobs ────────────────────────────────────────────────────────

export interface ImportJob {
  id: string;
  source_platform: 'aliexpress' | 'shein' | 'amazon';
  source_url: string | null;
  search_query: string | null;
  category_id: string | null;
  category_name: string | null;
  status: 'queued' | 'running' | 'done' | 'failed';
  products_found: number | null;
  products_added: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export const apiGetImportJobs = () =>
  api.get('/admin/import-jobs').then(unwrap<ImportJob[]>);

export const apiCreateImportJob = (body: {
  sourcePlatform: 'aliexpress' | 'shein' | 'amazon';
  searchQuery?: string;
  sourceUrl?: string;
  categoryId?: string;
  maxProducts?: number;
}) => api.post('/admin/import-jobs', body).then(unwrap<ImportJob>);
