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

/**
 * Brace/bracket-match and JSON.parse a `marker = {...}` / `"marker": [...]`
 * assignment embedded in HTML. Handles nested structures and strings — unlike
 * a non-greedy regex, which truncates on the first nested closer.
 */
function extractJsonAssignment(html: string, marker: RegExp): unknown {
  const m = html.match(marker);
  if (!m || m.index == null) return null;
  const afterMarker = m.index + m[0].length;
  let start = -1;
  for (let i = afterMarker - 1; i < html.length; i++) {
    const c = html[i];
    if (c === "{" || c === "[") { start = i; break; }
    if (!/[\s=:]/.test(c)) return null;
  }
  if (start === -1) return null;

  const open = html[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) {
      try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

function extractGbRawData(html: string): Record<string, unknown> | null {
  const parsed = extractJsonAssignment(html, /gbRawData\s*=\s*\{/);
  return isObj(parsed) ? parsed : null;
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

  // Collect every SKC node (each colour carries its own sku_list + priceInfo).
  const skcNodes: Node[] = [];
  (function collect(node: unknown, d: number) {
    if (!node || typeof node !== "object" || d > 12) return;
    if (isObj(node) && Array.isArray(node.sku_list)) skcNodes.push(node);
    for (const v of Object.values(node as Node)) collect(v, d + 1);
  })(gb, 0);

  const skcSale = (skc: Node): number => {
    const sku0 = (skc.sku_list as Node[])[0];
    const pi = isObj(sku0) ? (sku0.priceInfo as Node | undefined) : undefined;
    return gbpCents((pi?.salePrice as Node | undefined)?.amount);
  };
  const skcRetail = (skc: Node): number => {
    const sku0 = (skc.sku_list as Node[])[0];
    const pi = isObj(sku0) ? (sku0.priceInfo as Node | undefined) : undefined;
    return gbpCents((pi?.retailPrice as Node | undefined)?.amount);
  };

  // Price (GBP) = the default colour (SKC whose goods_id matches the product),
  // else the lowest sale price across colours, else any deep priceInfo node.
  let sourcePriceUsdCents = 0;
  const matchSkc = skcNodes.find((s) => String(s.goods_id) === sourceId);
  if (matchSkc) sourcePriceUsdCents = skcSale(matchSkc);
  if (sourcePriceUsdCents === 0 && skcNodes.length) {
    const amts = skcNodes.map(skcSale).filter((n) => n > 0);
    if (amts.length) sourcePriceUsdCents = Math.min(...amts);
  }
  if (sourcePriceUsdCents === 0) {
    const priceNode = deepFind(gb, (n) => isObj(n.salePrice) && "amount" in (n.salePrice as Node));
    sourcePriceUsdCents = gbpCents((priceNode?.salePrice as Node | undefined)?.amount);
  }
  if (!name || sourcePriceUsdCents === 0) return null; // let the meta fallback try

  // SHEIN's list ("retail") price feeds the strike-through display.
  const retailCents = matchSkc ? skcRetail(matchSkc) : 0;
  const compareAtCents = retailCents > sourcePriceUsdCents ? retailCents : undefined;

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

  // The default colour (selected SKC) ships a full gallery in `skcImages`; other
  // colours only carry a single representative image. Build the product gallery
  // from every colour's image plus the default colour's extra shots, deduped.
  const colourImage = (c: Node): string => httpsify(c.goods_image);
  const skcImgNode = deepFind(gb, (n) => Array.isArray(n.skcImages) && (n.skcImages as unknown[]).length > 0);
  const skcImages = skcImgNode ? (skcImgNode.skcImages as unknown[]).map(httpsify).filter(Boolean) : [];
  const images = [...new Set([
    ...colours.map(colourImage),
    ...skcImages,
    httpsify(detail.goods_img),
  ].filter(Boolean))];

  // Variants: colour × size. Real per-size stock when the size-id resolves,
  // otherwise the product-level stock as a best effort. Each variant points at
  // its colour image (which is part of `images`, so the storefront can map them).
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
        imageUrl: c ? colourImage(c) || undefined : undefined,
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
    compareAtCents,
    sourceCurrency: "GBP",
    // SHEIN pages don't expose weight — the import job substitutes the
    // category default; this is just the fallback of last resort.
    weightGrams: 300,
    weightSource: "category_default",
    variants,
    stockStatus,
    tags: [],
  };
}

/** Colour swatches with their own product pages (for per-colour gallery fetches). */
export function sheinColorTargets(html: string): Array<{ color: string; url: string; isDefault: boolean }> {
  const gb = extractGbRawData(html);
  if (!gb) return [];
  const detail = deepFind(gb, (n) =>
    typeof n.goods_name === "string" && n.goods_id != null && "goods_sn" in n);
  const sourceId = String(detail?.goods_id ?? "");
  const msa = deepFind(gb, (n) =>
    Array.isArray(n.info) && (n.info as Node[]).some((x) => isObj(x) && x.attr_name === "Color"));
  const colours = msa ? (msa.info as Node[]).filter((c) => isObj(c) && c.attr_name === "Color") : [];
  return colours
    .map((c) => {
      const color = String(c.attr_value ?? "");
      const id = String(c.goods_id ?? "");
      const urlName = String(c.goods_url_name ?? "product").trim().replace(/\s+/g, "-");
      return { color, url: `https://www.shein.co.uk/${urlName}-p-${id}.html`, isDefault: id === sourceId };
    })
    .filter((t) => t.color && /-p-\d+/.test(t.url));
}

/** The full image gallery for a single SKC/colour page (`skcImages`). */
export function sheinSkcImages(html: string): string[] {
  const gb = extractGbRawData(html);
  if (!gb) return [];
  const node = deepFind(gb, (n) => Array.isArray(n.skcImages) && (n.skcImages as unknown[]).length > 0);
  return node ? (node.skcImages as unknown[]).map(httpsify).filter(Boolean) : [];
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
    // gbRawData present but unusable — say why so failures are diagnosable.
    const detail = deepFind(gb, (n) =>
      typeof n.goods_name === "string" && n.goods_id != null && "goods_sn" in n);
    console.warn(
      `[shein] gbRawData found but unusable (detail node: ${!!detail}, ` +
        `name: ${detail ? JSON.stringify(String(detail.goods_name).slice(0, 30)) : "n/a"}) — likely no resolvable price`,
    );
  } else {
    console.warn(
      `[shein] no gbRawData in page (html ${html.length} bytes, ` +
        `marker present: ${html.includes("gbRawData")}, title: ${JSON.stringify($("title").text().slice(0, 60))})`,
    );
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
    weightSource: "category_default",
    variants: [],
    tags: [],
  };
}

interface SheinSearchItem {
  goods_id?: number | string;
  goods_name?: string;
  salePrice?: { amount?: string };
  goods_img?: string;
  goods_url_name?: string;
}

/**
 * Parse a SHEIN search page. Product lists live in script JSON — either inside
 * gbRawData or as a standalone "goods_list" assignment. Bracket-matched, never
 * regexed, so nested arrays don't truncate the list. URLs target the UK
 * storefront to match GBP pricing.
 */
export function parseSheinSearchHtml(html: string): Partial<ScrapedProduct>[] {
  let list: SheinSearchItem[] = [];

  // Preferred: a product array inside gbRawData (items with goods_id + goods_name).
  const gb = extractGbRawData(html);
  if (gb) {
    const found = deepFindArray(gb, (arr) => {
      const first = arr[0];
      return isObj(first) && "goods_id" in first && "goods_name" in first;
    });
    if (found) list = found as SheinSearchItem[];
  }

  // Fallback: a standalone "goods_list": [...] assignment anywhere in the page.
  if (!list.length) {
    const extracted = extractJsonAssignment(html, /"goods_list"\s*:/);
    if (Array.isArray(extracted)) list = extracted as SheinSearchItem[];
  }

  const results: Partial<ScrapedProduct>[] = [];
  for (const item of list) {
    if (!item?.goods_name || item.goods_id == null) continue;
    const id = String(item.goods_id);
    const urlName = String(item.goods_url_name ?? "product").trim().replace(/\s+/g, "-");
    results.push({
      sourcePlatform: "shein",
      sourceUrl: `https://www.shein.co.uk/${urlName}-p-${id}.html`,
      sourceId: id,
      name: item.goods_name,
      images: item.goods_img ? [httpsify(item.goods_img)] : [],
      sourcePriceUsdCents: gbpCents(item.salePrice?.amount),
      sourceCurrency: "GBP",
      weightGrams: 300,
      weightSource: "category_default",
      variants: [],
      tags: [],
    });
  }
  return results;
}

/** Depth-first search for the first non-empty array matching the predicate. */
function deepFindArray(root: unknown, pred: (arr: unknown[]) => boolean, maxDepth = 10): unknown[] | null {
  const stack: Array<[unknown, number]> = [[root, 0]];
  while (stack.length) {
    const [node, d] = stack.pop()!;
    if (!node || typeof node !== "object" || d > maxDepth) continue;
    if (Array.isArray(node) && node.length && pred(node)) return node;
    for (const v of Object.values(node as Record<string, unknown>)) stack.push([v, d + 1]);
  }
  return null;
}
