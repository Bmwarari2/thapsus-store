/**
 * Shein product parser.
 * Shein renders via the Oxylabs universal scraper (render: html). Product data is
 * embedded as a large JSON blob assigned to `window.gbRawData`.
 *
 * Prices are GBP (SHEIN UK). We extract name, images, price, colour/size variants
 * (with per-size stock for the primary colour) and an overall availability status.
 */

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { ScrapedProduct, ScrapedVariant, StockStatus } from "@thapsus/shared";

const isObj = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);

/** Prepend https: to protocol-relative SHEIN image URLs. */
function httpsify(u?: unknown): string {
  if (typeof u !== "string") return "";
  const t = u.trim();
  return t.startsWith("//") ? `https:${t}` : t;
}

/** GBP amount string ("11.08") → integer cents. */
function gbpCents(amount?: unknown): number {
  if (amount == null) return 0;
  const n = parseFloat(String(amount));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Brace-match and JSON.parse the real `gbRawData = {...}` assignment. */
function extractGbRawData(html: string): Record<string, unknown> | null {
  const m = html.match(/gbRawData\s*=\s*\{/);
  if (!m || m.index == null) return null;
  const start = html.indexOf("{", m.index);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

type Node = Record<string, unknown>;

/** Depth-first search for the first object node matching the predicate. */
function deepFind(root: unknown, pred: (n: Node) => boolean, maxDepth = 12): Node | null {
  const stack: Array<[unknown, number]> = [[root, 0]];
  while (stack.length) {
    const [node, d] = stack.pop()!;
    if (!node || typeof node !== "object" || d > maxDepth) continue;
    if (isObj(node) && pred(node)) return node;
    for (const v of Object.values(node as Node)) stack.push([v, d + 1]);
  }
  return null;
}

/** Build a ScrapedProduct from the parsed gbRawData blob, or null if not usable. */
function buildFromGbRawData($: CheerioAPI, gb: Node, sourceUrl: string): ScrapedProduct | null {
  // The product "detail" node carries goods_name + goods_id + goods_sn.
  const detail = deepFind(gb, (n) =>
    typeof n.goods_name === "string" && n.goods_id != null && "goods_sn" in n);
  if (!detail) return null;

  const name = String(detail.goods_name);
  const sourceId = String(detail.goods_id ?? "");

  // Price (GBP). Prefer a priceInfo node carrying both sale + retail amounts.
  const priceNode = deepFind(gb, (n) =>
    isObj(n.salePrice) && "amount" in (n.salePrice as Node) &&
    isObj(n.retailPrice) && "amount" in (n.retailPrice as Node));
  const salePrice = (priceNode?.salePrice ?? detail.salePrice) as Node | undefined;
  const retailPrice = (priceNode?.retailPrice ?? detail.retailPrice) as Node | undefined;
  const sourcePriceUsdCents = gbpCents(salePrice?.amount ?? retailPrice?.amount);
  if (!name || sourcePriceUsdCents === 0) return null; // let the meta fallback try

  // Colours: mainSaleAttribute.info[] entries with attr_name "Color".
  const msa = deepFind(gb, (n) =>
    Array.isArray(n.info) && (n.info as Node[]).some((x) => isObj(x) && x.attr_name === "Color"));
  const colours = msa
    ? (msa.info as Node[]).filter((c) => isObj(c) && c.attr_name === "Color")
    : [];

  // Sizes: a skc_sale_attr entry flagged as Size.
  const sizeAttr = deepFind(gb, (n) =>
    (n.attr_name === "Size" || n.isSize === "1") && Array.isArray(n.attr_value_list));
  const sizes = sizeAttr ? (sizeAttr.attr_value_list as Node[]) : [];

  // Per-size stock for the primary colour: comboStock.dataMap keys look like "Size__755,".
  const combo = deepFind(gb, (n) => isObj(n.dataMap) && isObj(n.skuMap));
  const stockBySizeId: Record<string, number> = {};
  if (combo) {
    for (const [k, v] of Object.entries(combo.dataMap as Record<string, unknown>)) {
      const mm = k.match(/Size__(\d+),$/);
      if (mm) stockBySizeId[mm[1]] = Number(v) || 0;
    }
  }

  const productStock = Number(detail.stock ?? 0) || 0;
  const onSale = detail.is_on_sale !== "0";

  // Images: product image + each colour's image, deduped.
  const images = [...new Set(
    [httpsify(detail.goods_img), ...colours.map((c) => httpsify(c.goods_image))].filter(Boolean),
  )];

  // Variants: colour × size. Real per-size stock when the size-id resolves,
  // otherwise the product-level stock as a best effort.
  const variants: ScrapedVariant[] = [];
  const colourList: Array<Node | null> = colours.length ? colours : [null];
  const sizeList: Array<Node | null> = sizes.length ? sizes : [null];
  for (const c of colourList) {
    for (const s of sizeList) {
      const attributes: Record<string, string> = {};
      if (c) attributes.Color = String(c.attr_value ?? "");
      if (s) attributes.Size = String(s.attr_value_name ?? s.attr_value_name_en ?? "");
      if (!Object.keys(attributes).length) continue;
      const sizeId = s ? String(s.attr_value_id ?? "") : "";
      const stockQty = sizeId && sizeId in stockBySizeId ? stockBySizeId[sizeId] : productStock;
      variants.push({
        attributes,
        imageUrl: c ? httpsify(c.goods_image) || undefined : undefined,
        stockQty,
      });
    }
  }

  const totalStock = variants.length
    ? variants.reduce((a, v) => a + (v.stockQty ?? 0), 0)
    : productStock;
  const stockStatus: StockStatus =
    !onSale || totalStock <= 0 ? "out_of_stock" : totalStock <= 5 ? "low_stock" : "in_stock";

  return {
    sourcePlatform: "shein",
    sourceUrl,
    sourceId,
    name,
    description: $('meta[name="description"]').attr("content") ?? "",
    images,
    sourcePriceUsdCents,
    sourceCurrency: "GBP",
    weightGrams: 300, // Shein items are typically light clothing
    variants,
    stockStatus,
    tags: [],
  };
}

export function parseSheinProduct(html: string, sourceUrl: string): ScrapedProduct | null {
  const $ = cheerio.load(html);

  // Primary path: the embedded gbRawData JSON blob.
  const gb = extractGbRawData(html);
  if (gb) {
    const built = buildFromGbRawData($, gb, sourceUrl);
    if (built) {
      console.log(
        `[shein] parsed "${built.name.slice(0, 40)}" — ${built.variants.length} variants, ` +
          `status ${built.stockStatus}, £${(built.sourcePriceUsdCents / 100).toFixed(2)}`,
      );
      return built;
    }
  }

  // Fallback: meta tags only (name + single image, no variants).
  const name = $('meta[property="og:title"]').attr("content") ?? $("h1").first().text().trim();
  if (!name) return null;

  console.warn("[shein] parsed via META-TAG FALLBACK — no variants/price detail available");
  const priceText = $('[class*="price"]').first().text().trim();
  const priceMatch = priceText.match(/[\d.]+/);
  const images: string[] = [];
  $('meta[property="og:image"]').each((_, el) => {
    const src = $(el).attr("content");
    if (src) images.push(httpsify(src));
  });

  return {
    sourcePlatform: "shein",
    sourceUrl,
    sourceId: sourceUrl.match(/[?&](?:goods_id|id)=(\d+)/)?.[1]
      ?? sourceUrl.match(/-p-(\d+)/)?.[1]
      ?? "",
    name,
    description: $('meta[name="description"]').attr("content") ?? "",
    images,
    sourcePriceUsdCents: gbpCents(priceMatch?.[0]),
    sourceCurrency: "GBP",
    weightGrams: 300,
    variants: [],
    tags: [],
  };
}

export function parseSheinSearchHtml(html: string): Partial<ScrapedProduct>[] {
  const $ = cheerio.load(html);
  const results: Partial<ScrapedProduct>[] = [];

  // Shein search results embed product list in script JSON
  $("script").each((_, el) => {
    const text = $(el).html() ?? "";
    if (!text.includes("goods_list")) return;

    const m = text.match(/"goods_list"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
    if (!m?.[1]) return;

    try {
      const list = JSON.parse(m[1]) as Array<{
        goods_id?: number | string;
        goods_name?: string;
        salePrice?: { amount?: string };
        goods_img?: string;
        goods_url_name?: string;
      }>;

      for (const item of list) {
        if (!item.goods_name) continue;
        const id = String(item.goods_id ?? "");
        results.push({
          sourcePlatform: "shein",
          sourceUrl: `https://www.shein.com/${item.goods_url_name ?? "product"}-p-${id}.html`,
          sourceId: id,
          name: item.goods_name,
          images: item.goods_img ? [httpsify(item.goods_img)] : [],
          sourcePriceUsdCents: gbpCents(item.salePrice?.amount),
          sourceCurrency: "GBP",
          weightGrams: 300,
          variants: [],
          tags: [],
        });
      }
    } catch { /* skip malformed JSON */ }
  });

  return results;
}
