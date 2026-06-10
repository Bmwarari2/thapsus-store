/**
 * Amazon product parser (UK storefront → GBP).
 * Normalises the Oxylabs amazon_product / amazon_search parsed responses into
 * ScrapedProduct. Amazon variation matrices aren't exposed by the parsed
 * payload in a usable way, so products import variant-less for now.
 */

import type { ScrapedProduct, SourceCurrency } from "@thapsus/shared";

interface AmazonContent {
  asin?: string;
  title?: string;
  price?: number | string;
  price_upper?: number | string;
  price_strikethrough?: number | string;
  currency?: string;
  images?: string[];
  description?: string;
  bullet_points?: string;
  brand?: string;
  manufacturer?: string;
  stock?: string;
  category?: Array<{ ladder?: Array<{ name?: string }> }>;
  product_details?: Record<string, unknown>;
  [key: string]: unknown;
}

function priceCents(price?: number | string): number {
  const n = typeof price === "string" ? parseFloat(price.replace(/[£$,]/g, "")) : price;
  if (!n || n <= 0 || !Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function currencyOf(c: AmazonContent): SourceCurrency {
  return c.currency === "USD" ? "USD" : "GBP"; // co.uk storefront default
}

function looksLikeAmazonImage(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (!/media-amazon\.com|images-amazon\.com|ssl-images-amazon/i.test(url)) return false;
  return !/sprite|icon|grey-pixel|transparent-pixel|play-button/i.test(url);
}

/** Swap Amazon's sized image variants (…._AC_SX342_.jpg) for the original. */
function upsizeAmazonImage(url: string): string {
  return url.replace(/\._[^/]*_\.(jpe?g|png|webp)$/i, ".$1");
}

function extractImages(c: AmazonContent): string[] {
  const named = Array.isArray(c.images) ? c.images.filter((v): v is string => typeof v === "string") : [];
  const candidates = named.length ? named : deepScanImages(c);
  const out: string[] = [];
  for (const raw of candidates) {
    const url = upsizeAmazonImage(raw);
    if (looksLikeAmazonImage(url) && !out.includes(url)) out.push(url);
    if (out.length >= 10) break;
  }
  return out;
}

function deepScanImages(root: unknown, maxDepth = 8): string[] {
  const found: string[] = [];
  const stack: Array<[unknown, number]> = [[root, 0]];
  while (stack.length && found.length < 40) {
    const [node, d] = stack.pop()!;
    if (d > maxDepth) continue;
    if (typeof node === "string") {
      if (looksLikeAmazonImage(node)) found.push(node);
    } else if (node && typeof node === "object") {
      for (const v of Object.values(node as Record<string, unknown>)) stack.push([v, d + 1]);
    }
  }
  return found;
}

/** Parse "1.2 kg" / "300 g" / "10.5 ounces" / "2 pounds" from the detail tables. */
function extractWeightGrams(c: AmazonContent): number | null {
  const details = c.product_details;
  if (!details) return null;
  for (const [key, value] of Object.entries(details)) {
    if (!/weight/i.test(key) || typeof value !== "string") continue;
    const m = value.match(/([\d.]+)\s*(kg|kilograms?|g|grams?|oz|ounces?|lbs?|pounds?)/i);
    if (!m) continue;
    const n = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    if (unit.startsWith("kg") || unit.startsWith("kilo")) return Math.round(n * 1000);
    if (unit.startsWith("lb") || unit.startsWith("pound")) return Math.round(n * 453.6);
    if (unit.startsWith("oz") || unit.startsWith("ounce")) return Math.round(n * 28.35);
    return Math.round(n);
  }
  return null;
}

export function parseAmazonProduct(content: unknown, sourceUrl: string): ScrapedProduct | null {
  const c = content as AmazonContent | null;
  if (!c?.title) return null;

  const saleCents = priceCents(c.price);
  if (!saleCents) {
    console.warn(`[amazon] no price for "${c.title.slice(0, 50)}" — content keys: [${Object.keys(c).join(", ")}]`);
    return null;
  }
  const strikeCents = priceCents(c.price_strikethrough);
  const images = extractImages(c);
  if (!images.length) {
    console.warn(`[amazon] no images for "${c.title.slice(0, 50)}" — sample: ${JSON.stringify(c).slice(0, 600)}`);
  }

  const weight = extractWeightGrams(c);
  const outOfStock = typeof c.stock === "string" && /unavailable|out of stock/i.test(c.stock);

  const categoryTags = (c.category ?? [])
    .flatMap((cat) => cat.ladder ?? [])
    .map((l) => l.name?.toLowerCase().trim())
    .filter((t): t is string => !!t && t.length > 2 && t.length < 30)
    .slice(0, 8);

  return {
    sourcePlatform: "amazon",
    sourceUrl,
    sourceId: String(c.asin ?? "").toUpperCase(),
    name: c.title,
    description: c.description || c.bullet_points || "",
    images,
    sourcePriceUsdCents: saleCents,
    compareAtCents: strikeCents > saleCents ? strikeCents : undefined,
    sourceCurrency: currencyOf(c),
    weightGrams: weight ?? 500,
    weightSource: weight != null ? "scraped" : "category_default",
    variants: [],
    tags: categoryTags,
    brand: c.brand ?? c.manufacturer,
    stockStatus: outOfStock ? "out_of_stock" : "in_stock",
  };
}

export function parseAmazonSearchItem(item: unknown): Partial<ScrapedProduct> | null {
  const i = item as { asin?: string; title?: string; url?: string; price?: number | string; url_image?: string };
  if (!i?.asin || !i.title) return null;
  return {
    sourcePlatform: "amazon",
    sourceUrl: `https://www.amazon.co.uk/dp/${i.asin}`,
    sourceId: String(i.asin).toUpperCase(),
    name: i.title,
    images: i.url_image ? [i.url_image] : [],
    sourcePriceUsdCents: priceCents(i.price),
    sourceCurrency: "GBP",
    weightGrams: 500,
    weightSource: "category_default",
    variants: [],
    tags: [],
  };
}
