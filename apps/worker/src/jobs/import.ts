/**
 * Import job processor.
 * Handles a single import_jobs row: scrapes products, uploads images,
 * computes v2 item pricing, and upserts into the products table.
 *
 * Invariants:
 *   • Item prices carry markup (+ duty/VAT when tax-inclusive) only — never
 *     weight or freight.
 *   • Upserts are race-free (ON CONFLICT on the source identity) and never
 *     overwrite admin edits to name/description or per-product markup.
 *   • Variants are upserted by a stable attribute key; rows missing from a
 *     fresh scrape are deactivated, never deleted, so carts/orders survive.
 *   • Search imports are capped by the job's max_products (falling back to
 *     pricing_config.search_import_max_products).
 */

import type { Job } from "bullmq";
import type { ScrapedProduct, ScrapedVariant } from "@thapsus/shared";
import { uniqueSlug, computeItemPriceKesCents, parsePricingConfigV2 } from "@thapsus/shared";
import { db } from "../db.js";
import { uploadProductImagesAligned } from "../images.js";
import {
  fetchAliExpressProduct,
  fetchAliExpressSearch,
  fetchAmazonProduct,
  fetchAmazonSearch,
  fetchSheinProduct,
  fetchSheinSearch,
  setScrapeJobContext,
  BudgetExceededError,
} from "../scrapers/oxylabs.js";
import { parseAliExpressProduct, parseAliExpressSearchItem } from "../scrapers/aliexpress.js";
import { parseAmazonProduct, parseAmazonSearchItem } from "../scrapers/amazon.js";
import { parseSheinProduct, parseSheinSearchHtml, sheinColorTargets, sheinSkcImages } from "../scrapers/shein.js";

export interface ImportJobPayload {
  jobId: string;
}

export interface RefreshProductPayload {
  productId: string;
}

type PricingConfig = ReturnType<typeof parsePricingConfigV2>;

async function loadPricingConfig(): Promise<PricingConfig> {
  const { rows } = await db.query(`SELECT key, value FROM pricing_config`);
  return parsePricingConfigV2(rows);
}

/** Deterministic variant identity — must match the API's canonicalVariantKey. */
function canonicalVariantKey(attributes: Record<string, string>): string {
  const sorted = Object.keys(attributes).sort().map((k) => [k, attributes[k]]);
  return JSON.stringify(sorted);
}

/**
 * Upsert the freshly scraped variant set by stable key. Existing ids are
 * preserved; keys absent from this scrape are deactivated.
 */
async function syncVariants(
  productId: string,
  scraped: ScrapedProduct,
  basePriceKesCents: number,
  config: PricingConfig,
  markupPct: number,
  imageMap: Map<string, string>,
): Promise<void> {
  const seenKeys: string[] = [];

  for (let i = 0; i < scraped.variants.length; i++) {
    const v: ScrapedVariant = scraped.variants[i];
    const key = canonicalVariantKey(v.attributes);
    if (seenKeys.includes(key)) continue; // duplicate attribute set in scrape
    seenKeys.push(key);

    const variantPrice = v.priceUsdCents != null
      ? computeItemPriceKesCents(v.priceUsdCents, scraped.sourceCurrency ?? "USD", config, markupPct)
      : basePriceKesCents;

    // Point the variant at the R2 copy of its colour image (so it matches the gallery).
    const imageUrl = (v.imageUrl && imageMap.get(v.imageUrl)) || v.imageUrl || null;

    await db.query(
      `INSERT INTO product_variants
         (product_id, attributes, variant_key, price_delta_kes_cents, stock_qty, image_url, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (product_id, variant_key) DO UPDATE
         SET price_delta_kes_cents = EXCLUDED.price_delta_kes_cents,
             stock_qty             = EXCLUDED.stock_qty,
             image_url             = EXCLUDED.image_url,
             sort_order            = EXCLUDED.sort_order,
             is_active             = true`,
      [
        productId,
        JSON.stringify(v.attributes),
        key,
        variantPrice - basePriceKesCents,
        v.stockQty ?? 0,
        imageUrl,
        i,
      ],
    );
  }

  if (seenKeys.length) {
    await db.query(
      `UPDATE product_variants SET is_active = false
       WHERE product_id = $1 AND NOT (variant_key = ANY($2::text[]))`,
      [productId, seenKeys],
    );
  }

  await db.query(
    `UPDATE products SET has_variants = $2 WHERE id = $1`,
    [productId, seenKeys.length > 0],
  );
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
  maxProducts: number,
): Promise<ScrapedProduct[]> {
  const results: ScrapedProduct[] = [];

  if (platform === "aliexpress") {
    if (sourceUrl) {
      const content = await fetchAliExpressProduct(sourceUrl);
      const product = parseAliExpressProduct(content, sourceUrl);
      if (product) results.push(product);
      else console.warn(`[import] aliexpress product parse returned null for ${sourceUrl}`);
    } else if (searchQuery) {
      const items = await fetchAliExpressSearch(searchQuery);
      console.log(`[import] aliexpress search "${searchQuery}" returned ${items.length} raw items (cap ${maxProducts})`);
      for (const item of items) {
        if (results.length >= maxProducts) break;
        const partial = parseAliExpressSearchItem(item);
        if (!partial?.sourceUrl) continue;
        try {
          const content = await fetchAliExpressProduct(partial.sourceUrl);
          const product = parseAliExpressProduct(content, partial.sourceUrl);
          if (product) results.push(product);
          else console.warn(`[import] aliexpress product parse returned null for ${partial.sourceUrl}`);
        } catch (err) {
          if (err instanceof BudgetExceededError) throw err;
          console.warn(`[import] failed to fetch aliexpress product ${partial.sourceUrl}:`, err);
        }
      }
    }
  } else if (platform === "amazon") {
    if (sourceUrl) {
      const content = await fetchAmazonProduct(sourceUrl);
      const product = parseAmazonProduct(content, sourceUrl);
      if (product) results.push(product);
      else console.warn(`[import] amazon product parse returned null for ${sourceUrl}`);
    } else if (searchQuery) {
      const items = await fetchAmazonSearch(searchQuery);
      console.log(`[import] amazon search "${searchQuery}" returned ${items.length} raw items (cap ${maxProducts})`);
      for (const item of items) {
        if (results.length >= maxProducts) break;
        const partial = parseAmazonSearchItem(item);
        if (!partial?.sourceUrl) continue;
        try {
          const content = await fetchAmazonProduct(partial.sourceUrl);
          const product = parseAmazonProduct(content, partial.sourceUrl);
          if (product) results.push(product);
          else console.warn(`[import] amazon product parse returned null for ${partial.sourceUrl}`);
        } catch (err) {
          if (err instanceof BudgetExceededError) throw err;
          console.warn(`[import] failed to fetch amazon product ${partial.sourceUrl}:`, err);
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
      console.log(`[import] shein search "${searchQuery}" returned ${partials.length} parsed items (cap ${maxProducts})`);
      for (const partial of partials) {
        if (results.length >= maxProducts) break;
        if (!partial.sourceUrl) continue;
        try {
          const productHtml = await fetchSheinProduct(partial.sourceUrl);
          const product = parseSheinProduct(productHtml, partial.sourceUrl);
          if (product) {
            await enrichSheinColorGalleries(product, productHtml);
            results.push(product);
          } else console.warn(`[import] shein product parse returned null for ${partial.sourceUrl}`);
        } catch (err) {
          if (err instanceof BudgetExceededError) throw err;
          console.warn(`[import] failed to fetch shein product ${partial.sourceUrl}:`, err);
        }
      }
    }
  } else {
    console.warn(`[import] unsupported platform "${platform}" — alibaba was dropped from the pipeline`);
  }

  return results;
}

/** Resolve the effective weight: scraped wins; otherwise the category default. */
async function resolveWeight(
  scraped: ScrapedProduct,
  categoryId: string | null,
): Promise<{ weightGrams: number; weightSource: string }> {
  if (scraped.weightSource === "scraped") {
    return { weightGrams: scraped.weightGrams, weightSource: "scraped" };
  }
  if (categoryId) {
    const { rows } = await db.query(
      `SELECT cwd.weight_grams
       FROM category_weight_defaults cwd
       JOIN categories c ON c.slug = cwd.category_slug
       WHERE c.id = $1`,
      [categoryId],
    );
    if (rows[0]) return { weightGrams: Number(rows[0].weight_grams), weightSource: "category_default" };
  }
  return { weightGrams: scraped.weightGrams || 500, weightSource: "category_default" };
}

async function upsertProduct(
  scraped: ScrapedProduct,
  categoryId: string | null,
  config: PricingConfig,
): Promise<{ id: string; isNew: boolean }> {
  const currency = scraped.sourceCurrency ?? "USD";
  const { weightGrams, weightSource } = await resolveWeight(scraped, categoryId);

  const compareAtKes = scraped.compareAtCents
    ? computeItemPriceKesCents(scraped.compareAtCents, currency, config)
    : null;

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

  // Race-free upsert on the source identity. On refresh: price/stock/images
  // and source fields update; admin-owned fields (name, description, category,
  // markup_pct, manual weight) are preserved. sell_price respects the row's
  // own markup, recomputed in SQL with the same formula as the engine.
  const slug = uniqueSlug(scraped.name);
  const defaultPrice = computeItemPriceKesCents(scraped.sourcePriceUsdCents, currency, config);

  const { rows: [row] } = await db.query(
    `INSERT INTO products (
       name, slug, description, category_id, brand_id, tags, images,
       source_platform, source_url, source_id,
       source_price_usd_cents, source_currency, markup_pct,
       sell_price_kes_cents, compare_at_kes_cents,
       weight_grams, weight_source,
       estimated_days_min, estimated_days_max, stock_status,
       last_scraped_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now())
     ON CONFLICT (source_platform, source_id) DO UPDATE SET
       source_price_usd_cents = EXCLUDED.source_price_usd_cents,
       source_currency        = EXCLUDED.source_currency,
       source_url             = EXCLUDED.source_url,
       sell_price_kes_cents   = ceil(
         EXCLUDED.source_price_usd_cents
         * (CASE WHEN EXCLUDED.source_currency = 'GBP' THEN $21::numeric ELSE $22::numeric END)
         * (1 + $23::numeric / 100)
         * (1 + products.markup_pct / 100)
         * $24::numeric
         / ($25::numeric * 100)
       ) * ($25::numeric * 100),
       compare_at_kes_cents   = EXCLUDED.compare_at_kes_cents,
       images                 = EXCLUDED.images,
       stock_status           = EXCLUDED.stock_status,
       weight_grams           = CASE WHEN products.weight_source = 'manual'
                                     THEN products.weight_grams ELSE EXCLUDED.weight_grams END,
       weight_source          = CASE WHEN products.weight_source = 'manual'
                                     THEN 'manual' ELSE EXCLUDED.weight_source END,
       last_scraped_at        = now(),
       updated_at             = now()
     RETURNING id, markup_pct, sell_price_kes_cents, (xmax = 0) AS is_new`,
    [
      scraped.name,
      slug,
      scraped.description || null,
      categoryId,
      brandId,
      scraped.tags,
      scraped.images, // replaced with CDN URLs below, once the real id exists
      scraped.sourcePlatform,
      scraped.sourceUrl,
      scraped.sourceId,
      scraped.sourcePriceUsdCents,
      currency,
      config.markupPct,
      defaultPrice,
      compareAtKes,
      weightGrams,
      weightSource,
      7,
      14,
      scraped.stockStatus ?? "in_stock",
      config.gbpToKesRate,
      config.usdToKesRate,
      config.fxBufferPct,
      config.taxInclusivePricing
        ? (1 + config.importDutyPct / 100) * (1 + config.vatPct / 100)
        : 1,
      config.priceRoundToKes,
    ],
  );

  const productId = row.id as string;
  const isNew = row.is_new as boolean;
  const rowMarkup = Number(row.markup_pct);
  const basePrice = Number(row.sell_price_kes_cents);

  // Upload the gallery PLUS every variant swatch under the real product id —
  // variant images outside the gallery were previously left hotlinking the
  // source CDN, which SHEIN blocks (the "missing colour images" bug).
  const variantImages = scraped.variants
    .map((v) => v.imageUrl)
    .filter((u): u is string => !!u);
  const uploadList = [...new Set([...scraped.images, ...variantImages])];
  const aligned = await uploadProductImagesAligned(productId, uploadList);

  const imageMap = new Map<string, string>();
  for (let i = 0; i < uploadList.length; i++) {
    if (aligned[i]) imageMap.set(uploadList[i], aligned[i]!);
  }

  let gallery = scraped.images
    .map((u) => imageMap.get(u))
    .filter((u): u is string => !!u);
  if (!gallery.length && scraped.images.length) gallery = scraped.images; // every upload failed — stay usable
  await db.query(`UPDATE products SET images = $2 WHERE id = $1`, [productId, gallery]);

  await syncVariants(productId, scraped, basePrice, config, rowMarkup, imageMap);

  return { id: productId, isNew };
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
  const { rows: capRows } = await db.query(
    `SELECT value FROM pricing_config WHERE key = 'search_import_max_products'`,
  );
  const maxProducts = Number(importJob.max_products ?? capRows[0]?.value ?? 24);

  let productsFound = 0;
  let productsAdded = 0;
  let productsUpdated = 0;

  setScrapeJobContext(jobId);
  try {
    const scraped = await scrapeProducts(
      importJob.source_platform,
      importJob.source_url,
      importJob.search_query,
      maxProducts,
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
  } finally {
    setScrapeJobContext(undefined);
  }
}

/**
 * Refresh a single product in place (enqueued by the API when a PDP serves
 * stale data). Reuses the single-URL import path; no import_jobs row.
 */
export async function processRefreshProduct(job: Job<RefreshProductPayload>): Promise<void> {
  const { productId } = job.data;
  const { rows } = await db.query(
    `SELECT id, source_platform, source_url, category_id FROM products WHERE id = $1 AND is_active = true`,
    [productId],
  );
  const product = rows[0];
  if (!product?.source_url || !["aliexpress", "shein", "amazon"].includes(product.source_platform)) return;

  const config = await loadPricingConfig();
  const scraped = await scrapeProducts(product.source_platform, product.source_url, null, 1);
  if (!scraped.length) {
    console.warn(`[refresh] no data for product ${productId} (${product.source_url})`);
    return;
  }
  await upsertProduct(scraped[0], product.category_id, config);
  console.log(`[refresh] product ${productId} refreshed`);
}
