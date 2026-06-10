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
