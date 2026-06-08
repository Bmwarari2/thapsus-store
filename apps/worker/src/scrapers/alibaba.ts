/**
 * Alibaba product parser.
 * Normalises Oxylabs parse:true structured response into ScrapedProduct.
 */

import type { ScrapedProduct } from "@thapsus/shared";

interface AlibabaContent {
  product_name?: string;
  title?: string;
  price_min?: number;
  price_max?: number;
  price?: number;
  description?: string;
  main_images?: string[];
  images?: string[];
  product_id?: string;
  supplier?: { name?: string };
  specifications?: Record<string, string>;
  sku_props?: Array<{
    name?: string;
    values?: Array<{ name?: string; image?: string }>;
  }>;
  weight?: string;
}

function parseWeight(raw?: string): number {
  if (!raw) return 500; // default 500g
  const match = raw.match(/([\d.]+)\s*(kg|g|lb)/i);
  if (!match) return 500;
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "kg") return Math.round(val * 1000);
  if (unit === "lb") return Math.round(val * 453.6);
  return Math.round(val);
}

function usdCents(price?: number): number {
  if (!price) return 0;
  return Math.round(price * 100);
}

export function parseAlibabaProduct(content: unknown, sourceUrl: string): ScrapedProduct | null {
  const c = content as AlibabaContent;
  const name = c.product_name ?? c.title;
  if (!name) return null;

  const price = c.price_min ?? c.price ?? 0;
  const images: string[] = (c.main_images ?? c.images ?? []).filter(Boolean);

  // Build variants from sku_props
  const variants: ScrapedProduct["variants"] = [];
  if (c.sku_props?.length) {
    const props = c.sku_props;
    // Only handle simple single-dimension SKU (e.g. just size or just color)
    // Multi-dim variant explosion is handled downstream if needed
    const firstProp = props[0];
    if (firstProp?.name && firstProp?.values?.length) {
      for (const v of firstProp.values) {
        if (!v.name) continue;
        variants.push({
          attributes: { [firstProp.name]: v.name },
          imageUrl: v.image ?? undefined,
        });
      }
    }
  }

  // Extract tags from specs
  const tags = Object.values(c.specifications ?? {})
    .flatMap((v) => String(v).split(/[,;/]/))
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 2 && t.length < 30)
    .slice(0, 10);

  return {
    sourcePlatform: "alibaba",
    sourceUrl,
    sourceId: c.product_id ?? sourceUrl.split("/").pop()?.split(".")[0] ?? "",
    name,
    description: c.description ?? "",
    images,
    sourcePriceUsdCents: usdCents(price),
    weightGrams: parseWeight(c.specifications?.["net_weight"] ?? c.specifications?.["weight"]),
    variants,
    tags,
    brand: c.supplier?.name,
  };
}

export function parseAlibabaSearchItem(item: unknown): Partial<ScrapedProduct> | null {
  const i = item as {
    title?: string;
    price?: number;
    min_price?: number;
    image?: string;
    product_id?: string;
    url?: string;
  };

  if (!i.title) return null;

  return {
    sourcePlatform: "alibaba",
    sourceUrl: i.url ?? `https://www.alibaba.com/product-detail/${i.product_id}.html`,
    sourceId: i.product_id ?? "",
    name: i.title,
    images: i.image ? [i.image] : [],
    sourcePriceUsdCents: usdCents(i.min_price ?? i.price),
    weightGrams: 500,
    variants: [],
    tags: [],
  };
}
