import { z } from "zod";

// ── Auth ─────────────────────────────────────────────────────────────────────

export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2).max(100),
  phone: z.string().optional(),
  referralCode: z.string().optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ── Cart ─────────────────────────────────────────────────────────────────────

export const AddToCartSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  qty: z.number().int().min(1).max(99).default(1),
});

export const UpdateCartItemSchema = z.object({
  qty: z.number().int().min(1).max(99),
});

// ── Orders ───────────────────────────────────────────────────────────────────

// Checkout is quote → order → pay. The quote re-prices the cart server-side;
// the order replays the quote's totals. M-Pesa is the only payment method
// until a card processor lands.

export const CreateQuoteSchema = z.object({
  promotionCode: z.string().max(50).optional(),
});

export const CreateOrderSchema = z.object({
  quoteId: z.string().uuid(),
  deliveryAddressId: z.string().uuid(),
  paymentMethod: z.enum(["mpesa"]),
  notes: z.string().max(500).optional(),
});

export const InitiateMpesaSchema = z.object({
  orderId: z.string().uuid(),
  phone: z.string().min(9).max(15),
});

// ── Delivery Addresses ────────────────────────────────────────────────────────

export const DeliveryAddressSchema = z.object({
  label: z.string().max(50).default("Home"),
  fullName: z.string().min(2).max(100),
  phone: z.string().min(9).max(15),
  county: z.string().min(2).max(50),
  town: z.string().min(2).max(100),
  addressLine: z.string().min(5).max(200),
  isDefault: z.boolean().default(false),
});

// ── Reviews ──────────────────────────────────────────────────────────────────

export const CreateReviewSchema = z.object({
  orderItemId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(100).optional(),
  body: z.string().max(2000).optional(),
  images: z.array(z.string().url()).max(5).default([]),
});

// ── Admin: Products ───────────────────────────────────────────────────────────

export const CreateProductSchema = z.object({
  name: z.string().min(3).max(255),
  description: z.string().optional(),
  categoryId: z.string().uuid(),
  brandName: z.string().optional(),
  tags: z.array(z.string()).max(20).default([]),
  images: z.array(z.string().url()).max(10).default([]),
  sourcePriceUsdCents: z.number().int().min(0),
  weightGrams: z.number().int().min(1).default(500),
  markupPct: z.number().min(0).max(500).optional(),
  estimatedDaysMin: z.number().int().min(1).default(7),
  estimatedDaysMax: z.number().int().min(1).default(14),
  sourcePlatform: z.enum(["aliexpress", "shein", "manual"]).default("manual"),
  sourceUrl: z.string().url().optional(),
});

export const UpdateProductSchema = CreateProductSchema.partial();

// ── Admin: Import Job ─────────────────────────────────────────────────────────
// Alibaba is dropped from the customer-facing pipeline (B2B/MOQ pricing would
// misquote retail customers).

export const CreateImportJobSchema = z.object({
  sourcePlatform: z.enum(["aliexpress", "shein"]),
  sourceUrl: z.string().url().optional(),
  searchQuery: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  maxProducts: z.number().int().min(1).max(96).optional(),
}).refine((d) => d.sourceUrl || d.searchQuery, {
  message: "Either sourceUrl or searchQuery is required",
});

// ── Admin: Pricing Config ─────────────────────────────────────────────────────

export const UpdatePricingConfigSchema = z.record(z.string(), z.string());
