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
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  images: string[];
  sellPriceKesCents: number;
  sourcePriceUsdCents: number;
  shippingFeeKesCents: number;
  taxKesCents: number;
  hasVariants: boolean;
  stockStatus: string;
  rating: number | null;
  reviewCount: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  isActive: boolean;
  isFeatured: boolean;
  categoryId: string;
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
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
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
