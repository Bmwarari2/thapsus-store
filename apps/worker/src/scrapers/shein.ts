/**
 * Shein product parser.
 * Shein uses the Oxylabs universal scraper (JS rendering).
 * Product data is embedded in the HTML as JSON inside <script> tags.
 */

import * as cheerio from "cheerio";
import type { ScrapedProduct } from "@thapsus/shared";

interface SheinProductData {
  detail?: {
    goods_id?: string | number;
    goods_name?: string;
    retailPrice?: { amount?: string | number };
    salePrice?: { amount?: string | number };
    description?: string;
  };
  skuList?: Array<{
    skuPropertyList?: Array<{ propertyValueName?: string; propertyValueDisplayName?: string }>;
    price?: { salePrice?: { amount?: string | number } };
  }>;
  attrList?: Array<{ attr_name?: string; attr_value?: string }>;
  images?: Array<{ origin_image?: string; src?: string }>;
}

function usdCents(amount?: string | number): number {
  if (amount == null) return 0;
  return Math.round(parseFloat(String(amount)) * 100);
}

function extractJsonFromScript(html: string, pattern: RegExp): unknown | null {
  const match = html.match(pattern);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function parseSheinProduct(html: string, sourceUrl: string): ScrapedProduct | null {
  const $ = cheerio.load(html);

  // TEMP DIAGNOSTIC: fingerprint the page we actually received so we can tell a
  // block/challenge page from a real product page and find where data lives.
  const fingerprint = {
    len: html.length,
    title: $("title").first().text().trim().slice(0, 100),
    ogTitle: ($('meta[property="og:title"]').attr("content") ?? "").slice(0, 80),
    ogImage: !!$('meta[property="og:image"]').attr("content"),
    ldJson: html.includes("application/ld+json"),
    goodsName: html.includes("goods_name"),
    productIntro: html.includes("productIntroData"),
    nuxt: html.includes("__NUXT__"),
    initialState: html.includes("__INITIAL_STATE__"),
    gbRaw: html.includes("gbRawData"),
    blocked: /just a moment|captcha|are you a robot|access denied|cf-chl|cloudflare/i.test(html),
  };
  console.log("[shein:diag] fingerprint", JSON.stringify(fingerprint));
  console.log("[shein:diag] head:", html.slice(0, 500).replace(/\s+/g, " "));
  const ld = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
  if (ld?.[1]) console.log("[shein:diag] ld+json:", ld[1].replace(/\s+/g, " ").slice(0, 600));

  // Shein embeds product data in several possible script patterns
  let productData: SheinProductData | null = null;

  $("script").each((_, el) => {
    const text = $(el).html() ?? "";

    // Pattern 1: window.gbRawData = {...}
    if (text.includes("gbRawData")) {
      const m = text.match(/gbRawData\s*=\s*(\{[\s\S]+?\});?\s*(?:window|var|let|const|$)/);
      if (m?.[1]) {
        try { productData = JSON.parse(m[1]) as SheinProductData; } catch { /* skip */ }
      }
    }

    // Pattern 2: __PAGE_CONTEXT_MODULE_MAP__ or similar embedded JSON blobs
    if (!productData && text.includes("goods_name")) {
      const m = text.match(/"goods_name"\s*:\s*"([^"]+)"/);
      if (m) {
        // Attempt to extract the surrounding object
        const startIdx = text.lastIndexOf("{", text.indexOf(m[0]));
        const endIdx = text.indexOf('"goods_imgs"', startIdx);
        if (startIdx !== -1 && endIdx !== -1) {
          try {
            // Build minimal object from extracted fields
            const name = m[1];
            const priceMatch = text.match(/"amount"\s*:\s*"([\d.]+)"/);
            const idMatch = text.match(/"goods_id"\s*:\s*(\d+)/);
            const imgMatches = [...text.matchAll(/"origin_image"\s*:\s*"([^"]+)"/g)];
            productData = {
              detail: {
                goods_id: idMatch?.[1] ?? "",
                goods_name: name,
                salePrice: { amount: priceMatch?.[1] ?? "0" },
              },
              images: imgMatches.map((m) => ({ origin_image: m[1] })),
            };
          } catch { /* skip */ }
        }
      }
    }
  });

  // Fallback: try to extract from meta tags and visible DOM
  if (!productData) {
    const name = $('meta[property="og:title"]').attr("content")
      ?? $("h1").first().text().trim();
    const priceText = $('[class*="price"]').first().text().trim();
    const priceMatch = priceText.match(/[\d.]+/);
    const images: string[] = [];
    $('meta[property="og:image"]').each((_, el) => {
      const src = $(el).attr("content");
      if (src) images.push(src);
    });

    if (!name) return null;

    console.warn("[shein] parsed via META-TAG FALLBACK — no variants/price detail available");
    return {
      sourcePlatform: "shein",
      sourceUrl,
      sourceId: sourceUrl.match(/[?&](?:goods_id|id)=(\d+)/)?.[1]
        ?? sourceUrl.match(/-p-(\d+)/)?.[1]
        ?? "",
      name,
      description: $('meta[name="description"]').attr("content") ?? "",
      images,
      sourcePriceUsdCents: usdCents(priceMatch?.[0]),
      sourceCurrency: "GBP",
      weightGrams: 300, // Shein items are typically light clothing
      variants: [],
      tags: [],
    };
  }

  const pd = productData as SheinProductData;
  const d = pd.detail;
  if (!d?.goods_name) return null;

  console.log(`[shein] parsed via JSON path — skuList length: ${pd.skuList?.length ?? 0}`);

  const images: string[] = (pd.images ?? [])
    .map((img: { origin_image?: string; src?: string }) => img.origin_image ?? img.src ?? "")
    .filter(Boolean);

  const price = d.salePrice?.amount ?? d.retailPrice?.amount ?? 0;

  // Build variants from skuList
  const variants: ScrapedProduct["variants"] = [];
  const seenVariants = new Set<string>();
  for (const sku of pd.skuList ?? []) {
    const attrs: Record<string, string> = {};
    for (const prop of sku.skuPropertyList ?? []) {
      const key = prop.propertyValueName ?? "option";
      attrs[key] = prop.propertyValueDisplayName ?? prop.propertyValueName ?? "";
    }
    const key = JSON.stringify(attrs);
    if (!seenVariants.has(key)) {
      seenVariants.add(key);
      variants.push({
        attributes: attrs,
        priceUsdCents: usdCents(sku.price?.salePrice?.amount),
      });
    }
  }

  const tags = (pd.attrList ?? [])
    .map((a: { attr_name?: string; attr_value?: string }) => `${a.attr_value ?? ""}`.toLowerCase().trim())
    .filter((t: string) => t.length > 1 && t.length < 40)
    .slice(0, 10);

  return {
    sourcePlatform: "shein",
    sourceUrl,
    sourceId: String(d.goods_id ?? ""),
    name: d.goods_name,
    description: d.description ?? "",
    images,
    sourcePriceUsdCents: usdCents(price),
    sourceCurrency: "GBP",
    weightGrams: 300,
    variants,
    tags,
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
          images: item.goods_img ? [item.goods_img] : [],
          sourcePriceUsdCents: usdCents(item.salePrice?.amount),
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
