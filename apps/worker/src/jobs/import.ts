/**
 * Import job processor.
 * Handles a single import_jobs row: scrapes products, uploads images,
 * computes pricing, and upserts into the products table.
 */

import type { Job } from "bullmq";
import type { ScrapedProduct } from "@thapsus/shared";
import { uniqueSlug, computeProductPrice, parsePricingConfig } from "@thapsus/shared";
import { db } from "../db.js";
import { uploadProductImages } from "../images.js";
import {
  fetchAlibabaProduct,
  fetchAlibabaSearch,
  fetchAliExpressProduct,
  fetchAliExpressSearch,
  fetchSheinProduct,
  fetchSheinSearch,
} from "../scrapers/oxylabs.js";
import { parseAlibabaProduct, parseAlibabaSearchItem } from "../scrapers/alibaba.js";
import { parseAliExpressProduct, parseAliExpressSearchItem } from "../scrapers/aliexpress.js";
import { parseSheinProduct, parseSheinSearchHtml, sheinColorTargets, sheinSkcImages } from "../scrapers/shein.js";

export interface ImportJobPayload {
  jobId: string;
}

async function loadPricingConfig() {
  const { rows } = await db.query(`SELECT key, value FROM pricing_config`);
  return parsePricingConfig(rows);
}

/** Replace a product's variants with the freshly scraped set (incl. per-variant stock). */
async function syncVariants(
  productId: string,
  scraped: ScrapedProduct,
  breakdown: ReturnType<typeof computeProductPrice>,
  pricingConfig: ReturnType<typeof parsePricingConfig>,
  imageMap: Map<string, string>,
): Promise<void> {
  await db.query(`DELETE FROM product_variants WHERE product_id = $1`, [productId]);

  for (let i = 0; i < scraped.variants.length; i++) {
    const v = scraped.variants[i];
    const variantPrice = v.priceUsdCents != null
      ? computeProductPrice(v.priceUsdCents, scraped.weightGrams, pricingConfig, scraped.sourceCurrency).totalKesCents
      : breakdown.totalKesCents;

    // Point the variant at the R2 copy of its colour image (so it matches the gallery).
    const imageUrl = (v.imageUrl && imageMap.get(v.imageUrl)) || v.imageUrl || null;

    await db.query(
      `INSERT INTO product_variants
         (product_id, attributes, price_delta_kes_cents, stock_qty, image_url, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        productId,
        JSON.stringify(v.attributes),
        variantPrice - breakdown.totalKesCents,
        v.stockQty ?? 0,
        imageUrl,
        i,
      ],
    );
  }

  await db.query(
    `UPDATE products SET has_variants = $2 WHERE id = $1`,
    [productId, scraped.variants.length > 0],
  );
}

/** Map each scraped source image URL to its uploaded R2/CDN URL (by position). */
function buildImageMap(sourceUrls: string[], cdnUrls: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < sourceUrls.length; i++) {
    if (cdnUrls[i]) map.set(sourceUrls[i], cdnUrls[i]);
  }
  return map;
}

const MAX_SHEIN_COLOR_FETCHES = 12;

/** Run an async fn over items with bounded concurrency. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

/**
 * Fetch each colour's own product page to collect its full image gallery, then
 * rebuild the product gallery with each colour's images grouped together and
 * point every variant at its colour's first image. Costs one extra Oxylabs
 * fetch per non-default colour (capped, bounded concurrency).
 */
async function enrichSheinColorGalleries(product: ScrapedProduct, mainHtml: string): Promise<void> {
  const targets = sheinColorTargets(mainHtml).slice(0, MAX_SHEIN_COLOR_FETCHES);
  if (targets.length <= 1) return; // single colour — nothing to enrich

  const galleries: Record<string, string[]> = {};
  await mapLimit(targets, 3, async (t) => {
    try {
      const imgs = t.isDefault ? sheinSkcImages(mainHtml) : sheinSkcImages(await fetchSheinProduct(t.url));
      if (imgs.length) galleries[t.color] = imgs;
    } catch (err) {
      console.warn(`[import] shein colour gallery fetch failed for "${t.color}":`, err);
    }
  });

  // Fall back to the colour's existing single image where a gallery wasn't found.
  for (const v of product.variants) {
    const c = v.attributes.Color;
    if (c && !galleries[c]?.length && v.imageUrl) galleries[c] = [v.imageUrl];
  }

  // Rebuild the product gallery: colours in order, images grouped per colour.
  const ordered: string[] = [];
  for (const t of targets) {
    for (const img of galleries[t.color] ?? []) if (!ordered.includes(img)) ordered.push(img);
  }
  if (ordered.length) product.images = ordered;

  // Each variant points at its colour's first image (which is part of the gallery).
  for (const v of product.variants) {
    const c = v.attributes.Color;
    if (c && galleries[c]?.length) v.imageUrl = galleries[c][0];
  }

  const total = Object.values(galleries).reduce((a, g) => a + g.length, 0);
  console.log(`[import] shein enriched ${Object.keys(galleries).length} colours, ${total} images`);
}

async function scrapeProducts(
  platform: string,
  sourceUrl: string | null,
  searchQuery: string | null,
): Promise<ScrapedProduct[]> {
  const results: ScrapedProduct[] = [];

  if (platform === "alibaba") {
    if (sourceUrl) {
      const content = await fetchAlibabaProduct(sourceUrl);
      const product = parseAlibabaProduct(content, sourceUrl);
      if (product) results.push(product);
      else console.warn(`[import] alibaba product parse returned null for ${sourceUrl}`);
    } else if (searchQuery) {
      const items = await fetchAlibabaSearch(searchQuery);
      console.log(`[import] alibaba search "${searchQuery}" returned ${items.length} raw items`);
      for (const item of items) {
        const partial = parseAlibabaSearchItem(item);
        if (!partial?.sourceUrl) { console.warn(`[import] alibaba search item skipped (no sourceUrl):`, JSON.stringify(item).slice(0, 200)); continue; }
        try {
          const content = await fetchAlibabaProduct(partial.sourceUrl);
          const product = parseAlibabaProduct(content, partial.sourceUrl);
          if (product) results.push(product);
          else console.warn(`[import] alibaba product parse returned null for ${partial.sourceUrl}`);
        } catch (err) {
          console.warn(`[import] failed to fetch alibaba product ${partial.sourceUrl}:`, err);
        }
      }
    }
  } else if (platform === "aliexpress") {
    if (sourceUrl) {
      const content = await fetchAliExpressProduct(sourceUrl);
      const product = parseAliExpressProduct(content, sourceUrl);
      if (product) results.push(product);
      else console.warn(`[import] aliexpress product parse returned null for ${sourceUrl}`);
    } else if (searchQuery) {
      const items = await fetchAliExpressSearch(searchQuery);
      console.log(`[import] aliexpress search "${searchQuery}" returned ${items.length} raw items`);
      for (const item of items) {
        const partial = parseAliExpressSearchItem(item);
        if (!partial?.sourceUrl) { console.warn(`[import] aliexpress search item skipped (no sourceUrl):`, JSON.stringify(item).slice(0, 200)); continue; }
        try {
          const content = await fetchAliExpressProduct(partial.sourceUrl);
          const product = parseAliExpressProduct(content, partial.sourceUrl);
          if (product) results.push(product);
          else console.warn(`[import] aliexpress product parse returned null for ${partial.sourceUrl}`);
        } catch (err) {
          console.warn(`[import] failed to fetch aliexpress product ${partial.sourceUrl}:`, err);
        }
      }
    }
  } else if (platform === "shein") {
    if (sourceUrl) {
      const html = await fetchSheinProduct(sourceUrl);
      const product = parseSheinProduct(html, sourceUrl);
      if (product) {
        await enrichSheinColorGalleries(product, html);
        results.push(product);
      } else console.warn(`[import] shein product parse returned null for ${sourceUrl}`);
    } else if (searchQuery) {
      const html = await fetchSheinSearch(searchQuery);
      const partials = parseSheinSearchHtml(html);
      console.log(`[import] shein search "${searchQuery}" returned ${partials.length} parsed items`);
      for (const partial of partials) {
        if (!partial.sourceUrl) continue;
        try {
          const productHtml = await fetchSheinProduct(partial.sourceUrl);
          const product = parseSheinProduct(productHtml, partial.sourceUrl);
          if (product) {
            await enrichSheinColorGalleries(product, productHtml);
            results.push(product);
          } else console.warn(`[import] shein product parse returned null for ${partial.sourceUrl}`);
        } catch (err) {
          console.warn(`[import] failed to fetch shein product ${partial.sourceUrl}:`, err);
        }
      }
    }
  }

  return results;
}

async function upsertProduct(
  scraped: ScrapedProduct,
  categoryId: string | null,
  config: ReturnType<typeof parsePricingConfig>,
): Promise<{ id: string; isNew: boolean }> {
  // Check if product already exists by source_id + platform
  const { rows: existing } = await db.query(
    `SELECT id FROM products WHERE source_platform = $1 AND source_id = $2`,
    [scraped.sourcePlatform, scraped.sourceId],
  );

  const pricingConfig = { ...config, markupPct: config.markupPct };
  const breakdown = computeProductPrice(
    scraped.sourcePriceUsdCents,
    scraped.weightGrams,
    pricingConfig,
    scraped.sourceCurrency,
  );

  // Resolve or create brand
  let brandId: string | null = null;
  if (scraped.brand) {
    const slug = scraped.brand.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
    const { rows } = await db.query(
      `INSERT INTO brands (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [scraped.brand, slug],
    );
    brandId = rows[0]?.id ?? null;
  }

  if (existing.length) {
    // Update existing — refresh price + images, don't overwrite admin edits to name/description
    const productId = existing[0].id as string;

    // Upload new images if source images changed
    const cdnImages = await uploadProductImages(productId, scraped.images);

    await db.query(
      `UPDATE products
       SET source_price_usd_cents = $2,
           shipping_fee_kes_cents = $3,
           tax_kes_cents          = $4,
           sell_price_kes_cents   = $5,
           images                 = $6,
           source_url             = $7,
           source_currency        = $8,
           stock_status           = $9,
           last_scraped_at        = now(),
           updated_at             = now()
       WHERE id = $1`,
      [
        productId,
        scraped.sourcePriceUsdCents,
        Math.round(breakdown.shippingKes * 100),
        Math.round(breakdown.vatKes * 100),
        breakdown.totalKesCents,
        cdnImages,
        scraped.sourceUrl,
        scraped.sourceCurrency ?? "USD",
        scraped.stockStatus ?? "in_stock",
      ],
    );

    await syncVariants(productId, scraped, breakdown, pricingConfig, buildImageMap(scraped.images, cdnImages));
    return { id: productId, isNew: false };
  }

  // Create new product (use temp ID for image path, then update)
  const tempId = Math.random().toString(36).slice(2, 12);
  const cdnImages = await uploadProductImages(tempId, scraped.images);
  const slug = uniqueSlug(scraped.name);

  const { rows: [newProduct] } = await db.query(
    `INSERT INTO products (
       name, slug, description, category_id, brand_id, tags, images,
       source_platform, source_url, source_id,
       source_price_usd_cents, source_currency, markup_pct,
       shipping_fee_kes_cents, tax_kes_cents, sell_price_kes_cents,
       estimated_days_min, estimated_days_max, stock_status,
       last_scraped_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now())
     RETURNING id`,
    [
      scraped.name,
      slug,
      scraped.description || null,
      categoryId,
      brandId,
      scraped.tags,
      cdnImages,
      scraped.sourcePlatform,
      scraped.sourceUrl,
      scraped.sourceId,
      scraped.sourcePriceUsdCents,
      scraped.sourceCurrency ?? "USD",
      config.markupPct,
      Math.round(breakdown.shippingKes * 100),
      Math.round(breakdown.vatKes * 100),
      breakdown.totalKesCents,
      7,
      14,
      scraped.stockStatus ?? "in_stock",
    ],
  );

  const productId = newProduct.id as string;

  await syncVariants(productId, scraped, breakdown, pricingConfig, buildImageMap(scraped.images, cdnImages));

  return { id: productId, isNew: true };
}

export async function processImportJob(job: Job<ImportJobPayload>): Promise<void> {
  const { jobId } = job.data;

  // Load job details from DB
  const { rows } = await db.query(`SELECT * FROM import_jobs WHERE id = $1`, [jobId]);
  const importJob = rows[0];
  if (!importJob) throw new Error(`Import job ${jobId} not found`);

  await db.query(
    `UPDATE import_jobs SET status = 'running', started_at = now() WHERE id = $1`,
    [jobId],
  );

  const config = await loadPricingConfig();
  let productsFound = 0;
  let productsAdded = 0;
  let productsUpdated = 0;

  try {
    const scraped = await scrapeProducts(
      importJob.source_platform,
      importJob.source_url,
      importJob.search_query,
    );

    productsFound = scraped.length;
    console.log(`[import:${jobId}] found ${productsFound} products`);

    for (let i = 0; i < scraped.length; i++) {
      const product = scraped[i];
      try {
        const { isNew } = await upsertProduct(product, importJob.category_id, config);
        if (isNew) productsAdded++;
        else productsUpdated++;

        // Report progress back to BullMQ
        await job.updateProgress(Math.round(((i + 1) / scraped.length) * 100));
      } catch (err) {
        console.error(`[import:${jobId}] failed to upsert product "${product.name}":`, err);
      }
    }

    await db.query(
      `UPDATE import_jobs
       SET status = 'done', finished_at = now(),
           products_found = $2, products_added = $3
       WHERE id = $1`,
      [jobId, productsFound, productsAdded],
    );

    console.log(
      `[import:${jobId}] done — ${productsFound} found, ` +
        `${productsAdded} added, ${productsUpdated} updated`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.query(
      `UPDATE import_jobs SET status = 'failed', finished_at = now(), error_message = $2 WHERE id = $1`,
      [jobId, message],
    );
    throw err; // Let BullMQ know the job failed so it can retry
  }
}
