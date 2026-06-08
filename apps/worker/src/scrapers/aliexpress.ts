/**
 * AliExpress product parser.
 * Normalises Oxylabs parse:true structured response into ScrapedProduct.
 */

import type { ScrapedProduct } from "@thapsus/shared";

interface AliExpressContent {
  product_name?: string;
  title?: string;
  price?: number;
  original_price?: number;
  sale_price?: number;
  description?: string;
  images?: string[];
  product_id?: string | number;
  store?: { name?: string };
  sku_props?: Array<{
    name?: string;
    values?: Array<{
      name?: string;
      image?: string;
      sku_id?: string;
    }>;
  }>;
  shipping?: { weight?: string };
  specifications?: Array<{ name?: string; value?: string }>;
}

function parseWeight(raw?: string): number {
  if (!raw) return 500;
  const match = raw.match(/([\d.]+)\s*(kg|g|lb)/i);
  if (!match) return 500;
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "kg") return Math.round(val * 1000);
  if (unit === "lb") return Math.round(val * 453.6);
  return Math.round(val);
}

function usdCents(price?: number): number {
  if (!price || price <= 0) return 0;
  return Math.round(price * 100);
}

export function parseAliExpressProduct(content: unknown, sourceUrl: string): ScrapedProduct | null {
  const c = content as AliExpressContent;
  const name = c.product_name ?? c.title;
  if (!name) return null;

  const price = c.sale_price ?? c.price ?? c.original_price ?? 0;
  const images: string[] = (c.images ?? []).filter(Boolean);

  const variants: ScrapedProduct["variants"] = [];
  if (c.sku_props?.length) {
    for (const prop of c.sku_props) {
      if (!prop.name || !prop.values?.length) continue;
      for (const v of prop.values) {
        if (!v.name) continue;
        // Check if this variant already exists (multi-prop SKUs)
        const existing = variants.find((ev) => Object.keys(ev.attributes).length < (c.sku_props?.length ?? 1));
        if (existing) {
          existing.attributes[prop.name] = v.name;
        } else {
          variants.push({
            attributes: { [prop.name]: v.name },
            imageUrl: v.image ?? undefined,
          });
        }
      }
      break; // Only first dimension for now — prevents combinatorial explosion
    }
  }

  const specs = c.specifications ?? [];
  const tags = specs
    .flatMap((s) => [s.name, s.value].filter(Boolean) as string[])
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length > 2 && t.length < 30)
    .slice(0, 10);

  const weightSpec = specs.find((s) =>
    ["weight", "package weight", "shipping weight"].some((w) =>
      s.name?.toLowerCase().includes(w),
    ),
  );

  return {
    sourcePlatform: "aliexpress",
    sourceUrl,
    sourceId: String(c.product_id ?? sourceUrl.match(/\/(\d+)\.html/)?.[1] ?? ""),
    name,
    description: c.description ?? "",
    images,
    sourcePriceUsdCents: usdCents(price),
    weightGrams: parseWeight(weightSpec?.value ?? c.shipping?.weight),
    variants,
    tags,
    brand: c.store?.name,
  };
}

export function parseAliExpressSearchItem(item: unknown): Partial<ScrapedProduct> | null {
  const i = item as {
    title?: string;
    price?: number;
    sale_price?: number;
    image?: string;
    product_id?: string | number;
    product_url?: string;
  };

  if (!i.title) return null;

  const id = String(i.product_id ?? "");
  return {
    sourcePlatform: "aliexpress",
    sourceUrl: i.product_url ?? `https://www.aliexpress.com/item/${id}.html`,
    sourceId: id,
    name: i.title,
    images: i.image ? [i.image] : [],
    sourcePriceUsdCents: usdCents(i.sale_price ?? i.price),
    weightGrams: 500,
    variants: [],
    tags: [],
  };
}
