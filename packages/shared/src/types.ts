// Shared TypeScript types used by both API and worker.

export type UserRole = "customer" | "admin";

export type OrderStatus =
  | "pending_payment"
  | "payment_confirmed"
  | "sourcing"
  | "shipped_to_hub"
  | "at_hub"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "refund_requested"
  | "refunded";

export type ImportJobStatus = "queued" | "running" | "done" | "failed" | "skipped";

export type ReviewStatus = "pending" | "approved" | "rejected";

// 'alibaba' remains only as a legacy value on old rows — the import pipeline
// no longer scrapes it.
export type SourcePlatform = "alibaba" | "aliexpress" | "shein" | "amazon" | "manual";

export type WeightSource = "scraped" | "category_default" | "manual";

export type SourceCurrency = "USD" | "GBP";

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

// Normalized product shape returned by all scrapers
export interface ScrapedProduct {
  sourcePlatform: SourcePlatform;
  sourceUrl: string;
  sourceId: string;
  name: string;
  description: string;
  images: string[];            // original URLs from source (will be re-uploaded to R2)
  sourcePriceUsdCents: number; // price in minor units of sourceCurrency (legacy name)
  sourceCurrency?: SourceCurrency; // defaults to USD when omitted
  weightGrams: number;
  weightSource?: WeightSource;     // 'scraped' when parsed from the source page
  compareAtCents?: number;         // source list/original price (minor units of sourceCurrency)
  variants: ScrapedVariant[];
  tags: string[];
  brand?: string;
  stockStatus?: StockStatus; // overall availability derived from source stock
}

export interface ScrapedVariant {
  attributes: Record<string, string>;  // e.g. { size: "XL", color: "Red" }
  priceUsdCents?: number;              // if variant has different price
  imageUrl?: string;
  stockQty?: number;
}

// Order status labels for display
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment:   "Awaiting Payment",
  payment_confirmed: "Payment Confirmed",
  sourcing:          "Sourcing Item",
  shipped_to_hub:    "Shipped to Kenya Hub",
  at_hub:            "Arrived in Kenya",
  out_for_delivery:  "Out for Delivery",
  delivered:         "Delivered",
  cancelled:         "Cancelled",
  refund_requested:  "Refund Requested",
  refunded:          "Refunded",
};
