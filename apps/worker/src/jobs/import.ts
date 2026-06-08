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
import { parseSheinProduct, parseSheinSearchHtml } from "../scrapers/shein.js";

export interface ImportJobPayload {
  jobId: string;
}

async function loadPricingConfig() {
  const { rows } = await db.query(`SELECT key, value FROM pricing_config`);
  return parsePricingConfig(rows);
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
    } else if (searchQuery) {
      const items = await fetchAlibabaSearch(searchQuery);
      for (const item of items) {
        const partial = parseAlibabaSearchItem(item);
        if (!partial?.sourceUrl) continue;
        // Fetch full product detail for each search result
        try {
          const content = await fetchAlibabaProduct(partial.sourceUrl);
          const product = parseAlibabaProduct(content, partial.sourceUrl);
          if (product) results.push(product);
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
    } else if (searchQuery) {
      const items = await fetchAliExpressSearch(searchQuery);
      for (const item of items) {
        const partial = parseAliExpressSearchItem(item);
        if (!partial?.sourceUrl) continue;
        try {
          const content = await fetchAliExpressProduct(partial.sourceUrl);
          const product = parseAliExpressProduct(content, partial.sourceUrl);
          if (product) results.push(product);
        } catch (err) {
          console.warn(`[import] failed to fetch aliexpress product ${partial.sourceUrl}:`, err);
        }
      }
    }
  } else if (platform === "shein") {
    if (sourceUrl) {
      const html = await fetchSheinProduct(sourceUrl);
      const product = parseSheinProduct(html, sourceUrl);
      if (product) results.push(product);
    } else if (searchQuery) {
      const html = await fetchSheinSearch(searchQuery);
      const partials = parseSheinSearchHtml(html);
      for (const partial of partials) {
        if (!partial.sourceUrl) continue;
        try {
          const productHtml = await fetchSheinProduct(partial.sourceUrl);
          const product = parseSheinProduct(productHtml, partial.sourceUrl);
          if (product) results.push(product);
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
  const breakdown = computeProductPrice(scraped.sourcePriceUsdCents, scraped.weightGrams, pricingConfig);

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
      ],
    );

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
       source_price_usd_cents, markup_pct,
       shipping_fee_kes_cents, tax_kes_cents, sell_price_kes_cents,
       estimated_days_min, estimated_days_max,
       last_scraped_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
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
      config.markupPct,
      Math.round(breakdown.shippingKes * 100),
      Math.round(breakdown.vatKes * 100),
      breakdown.totalKesCents,
      7,
      14,
    ],
  );

  const productId = newProduct.id as string;

  // Insert variants
  for (let i = 0; i < scraped.variants.length; i++) {
    const v = scraped.variants[i];
    const variantPrice = v.priceUsdCents != null
      ? computeProductPrice(v.priceUsdCents, scraped.weightGrams, pricingConfig).totalKesCents
      : breakdown.totalKesCents;

    await db.query(
      `INSERT INTO product_variants (product_id, attributes, price_delta_kes_cents, image_url, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [
        productId,
        JSON.stringify(v.attributes),
        variantPrice - breakdown.totalKesCents,
        v.imageUrl ?? null,
        i,
      ],
    );
  }

  if (scraped.variants.length > 0) {
    await db.query(`UPDATE products SET has_variants = true WHERE id = $1`, [productId]);
  }

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

    console.log(`[import:${jobId}] done — ${productsAdded}/${productsFound} imported`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.query(
      `UPDATE import_jobs SET status = 'failed', finished_at = now(), error_message = $2 WHERE id = $1`,
      [jobId, message],
    );
    throw err; // Let BullMQ know the job failed so it can retry
  }
}
