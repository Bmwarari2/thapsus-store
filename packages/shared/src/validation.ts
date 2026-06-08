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

export const CreateOrderSchema = z.object({
  deliveryAddressId: z.string().uuid(),
  paymentMethod: z.enum(["mpesa", "card"]),
  phone: z.string().optional(),  // M-Pesa phone if different from profile
  promotionCode: z.string().optional(),
  notes: z.string().max(500).optional(),
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
  sourcePlatform: z.enum(["alibaba", "aliexpress", "shein", "manual"]).default("manual"),
  sourceUrl: z.string().url().optional(),
});

export const UpdateProductSchema = CreateProductSchema.partial();

// ── Admin: Import Job ─────────────────────────────────────────────────────────

export const CreateImportJobSchema = z.object({
  sourcePlatform: z.enum(["alibaba", "aliexpress", "shein"]),
  sourceUrl: z.string().url().optional(),
  searchQuery: z.string().optional(),
  categoryId: z.string().uuid().optional(),
}).refine((d) => d.sourceUrl || d.searchQuery, {
  message: "Either sourceUrl or searchQuery is required",
});

// ── Admin: Pricing Config ─────────────────────────────────────────────────────

export const UpdatePricingConfigSchema = z.record(z.string(), z.string());
