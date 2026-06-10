/**
 * AliExpress product parser.
 * Normalises the Oxylabs parse:true structured response into ScrapedProduct.
 *
 * Variants come from the per-SKU data when the payload carries it (each SKU is
 * a concrete combination with its own price/stock); only when no SKU list is
 * present do we fall back to a bounded cartesian product of the property axes.
 */

import type { ScrapedProduct, ScrapedVariant } from "@thapsus/shared";

interface SkuPropValue {
  name?: string;
  id?: string | number;
  vid?: string | number;
  image?: string;
  sku_id?: string;
}

interface SkuProp {
  name?: string;
  pid?: string | number;
  values?: SkuPropValue[];
}

interface SkuEntry {
  sku_id?: string | number;
  id?: string | number;
  // Combination encodings seen across payload versions:
  sku_attr?: string;                       // "14:29#Black;5:100014#XL"
  properties?: string;                     // "14:29;5:100014"
  prop_value_ids?: Array<string | number>; // [29, 100014]
  price?: number | string;
  sale_price?: number | string;
  discount_price?: number | string;
  stock?: number | string;
  available_quantity?: number | string;
  quantity?: number | string;
  image?: string;
}

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
  sku_props?: SkuProp[];
  skus?: SkuEntry[];
  sku_list?: SkuEntry[];
  variations?: SkuEntry[];
  shipping?: { weight?: string };
  specifications?: Array<{ name?: string; value?: string }>;
}

function parseWeight(raw?: string): number | null {
  if (!raw) return null;
  const match = raw.match(/([\d.]+)\s*(kg|g|lb)/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "kg") return Math.round(val * 1000);
  if (unit === "lb") return Math.round(val * 453.6);
  return Math.round(val);
}

function usdCents(price?: number | string): number {
  const n = typeof price === "string" ? parseFloat(price) : price;
  if (!n || n <= 0 || !Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

const MAX_VARIANTS = 60;

/** Map of value-id → { propName, valueName, image } across all property axes. */
function buildValueIndex(props: SkuProp[]): Map<string, { prop: string; value: string; image?: string }> {
  const index = new Map<string, { prop: string; value: string; image?: string }>();
  for (const prop of props) {
    if (!prop.name) continue;
    for (const v of prop.values ?? []) {
      const id = String(v.id ?? v.vid ?? "");
      if (!id || !v.name) continue;
      index.set(id, { prop: prop.name, value: v.name, image: v.image });
    }
  }
  return index;
}

/** Pull the value-ids out of whichever combination encoding the SKU uses. */
function skuValueIds(sku: SkuEntry): string[] {
  if (Array.isArray(sku.prop_value_ids) && sku.prop_value_ids.length) {
    return sku.prop_value_ids.map(String);
  }
  const encoded = sku.sku_attr ?? sku.properties;
  if (typeof encoded === "string" && encoded) {
    // "14:29#Black;5:100014#XL" → value ids 29, 100014
    return encoded
      .split(";")
      .map((part) => part.split("#")[0]?.split(":")[1])
      .filter((x): x is string => !!x);
  }
  return [];
}

function variantsFromSkus(skus: SkuEntry[], props: SkuProp[]): ScrapedVariant[] {
  const index = buildValueIndex(props);
  const variants: ScrapedVariant[] = [];

  for (const sku of skus.slice(0, MAX_VARIANTS)) {
    const ids = skuValueIds(sku);
    if (!ids.length) continue;

    const attributes: Record<string, string> = {};
    let imageUrl: string | undefined;
    for (const id of ids) {
      const entry = index.get(id);
      if (!entry) continue;
      attributes[entry.prop] = entry.value;
      if (!imageUrl && entry.image) imageUrl = entry.image;
    }
    if (!Object.keys(attributes).length) continue;

    const price = usdCents(sku.sale_price ?? sku.discount_price ?? sku.price);
    const stockRaw = sku.stock ?? sku.available_quantity ?? sku.quantity;
    const stock = stockRaw != null ? Number(stockRaw) : undefined;

    variants.push({
      attributes,
      priceUsdCents: price > 0 ? price : undefined,
      stockQty: Number.isFinite(stock) ? stock : undefined,
      imageUrl: imageUrl ?? (sku.image || undefined),
    });
  }
  return variants;
}

/** Bounded cartesian fallback when the payload has axes but no SKU list. */
function variantsFromProps(props: SkuProp[]): ScrapedVariant[] {
  const axes = props.filter((p) => p.name && p.values?.length);
  if (!axes.length) return [];

  let combos: Array<{ attributes: Record<string, string>; imageUrl?: string }> = [{ attributes: {} }];
  for (const axis of axes) {
    const next: typeof combos = [];
    for (const combo of combos) {
      for (const v of axis.values!) {
        if (!v.name) continue;
        next.push({
          attributes: { ...combo.attributes, [axis.name!]: v.name },
          imageUrl: combo.imageUrl ?? v.image,
        });
        if (next.length >= MAX_VARIANTS) break;
      }
      if (next.length >= MAX_VARIANTS) break;
    }
    combos = next;
  }
  return combos.map((c) => ({ attributes: c.attributes, imageUrl: c.imageUrl }));
}

export function parseAliExpressProduct(content: unknown, sourceUrl: string): ScrapedProduct | null {
  const c = content as AliExpressContent;
  const name = c.product_name ?? c.title;
  if (!name) return null;

  const price = c.sale_price ?? c.price ?? c.original_price ?? 0;
  const images: string[] = (c.images ?? []).filter(Boolean);

  const skus = c.skus ?? c.sku_list ?? c.variations ?? [];
  const props = c.sku_props ?? [];
  let variants = variantsFromSkus(skus, props);
  if (!variants.length) variants = variantsFromProps(props);

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
  const scrapedWeight = parseWeight(weightSpec?.value ?? c.shipping?.weight);

  const originalCents = usdCents(c.original_price);
  const saleCents = usdCents(price);

  return {
    sourcePlatform: "aliexpress",
    sourceUrl,
    sourceId: String(c.product_id ?? sourceUrl.match(/\/(\d+)\.html/)?.[1] ?? ""),
    name,
    description: c.description ?? "",
    images,
    sourcePriceUsdCents: saleCents,
    compareAtCents: originalCents > saleCents ? originalCents : undefined,
    weightGrams: scrapedWeight ?? 500,
    weightSource: scrapedWeight != null ? "scraped" : "category_default",
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
    weightSource: "category_default",
    variants: [],
    tags: [],
  };
}
