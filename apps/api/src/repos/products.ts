import { db } from "../db.js";
import { uniqueSlug } from "@thapsus/shared";

export interface Product {
  id: string;
  sourcePlatform: string | null;
  sourceUrl: string | null;
  sourceId: string | null;
  name: string;
  slug: string;
  description: string | null;
  brandId: string | null;
  categoryId: string;
  tags: string[];
  images: string[];
  sourcePriceUsdCents: number;
  sourceCurrency: string;
  markupPct: number;
  sellPriceKesCents: number;
  compareAtKesCents: number | null;
  weightGrams: number;
  weightSource: string;
  hasVariants: boolean;
  stockStatus: string;
  viewCount: number;
  orderCount: number;
  rating: number | null;
  reviewCount: number;
  sourceRating: number | null;
  sourceReviewCount: number | null;
  isActive: boolean;
  isFeatured: boolean;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  lastScrapedAt: string | null;
  createdAt: string;
}

/**
 * The catalog shape customers see. Deliberately excludes source price, markup,
 * source URL/id/platform, and weight — the cost basis and supply chain are
 * admin-only (full Product via /admin routes).
 */
export interface PublicProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  images: string[];
  sellPriceKesCents: number;
  compareAtKesCents: number | null;
  hasVariants: boolean;
  stockStatus: string;
  rating: number | null;
  reviewCount: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  isFeatured: boolean;
  categoryId: string;
  createdAt: string;
}

export function toPublicProduct(p: Product): PublicProduct {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    images: p.images,
    sellPriceKesCents: p.sellPriceKesCents,
    compareAtKesCents: p.compareAtKesCents,
    hasVariants: p.hasVariants,
    stockStatus: p.stockStatus,
    // Local approved reviews take precedence; else show the source site's stars.
    rating: p.rating ?? p.sourceRating,
    reviewCount: p.reviewCount || p.sourceReviewCount || 0,
    estimatedDaysMin: p.estimatedDaysMin,
    estimatedDaysMax: p.estimatedDaysMax,
    isFeatured: p.isFeatured,
    categoryId: p.categoryId,
    createdAt: p.createdAt,
  };
}

export interface ProductVariant {
  id: string;
  productId: string;
  attributes: Record<string, string>;
  sku: string | null;
  priceDeltaKesCents: number;
  stockQty: number;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    sourcePlatform: row.source_platform as string | null,
    sourceUrl: row.source_url as string | null,
    sourceId: row.source_id as string | null,
    name: row.name as string,
    slug: row.slug as string,
    description: row.description as string | null,
    brandId: row.brand_id as string | null,
    categoryId: row.category_id as string,
    tags: (row.tags as string[]) ?? [],
    images: (row.images as string[]) ?? [],
    sourcePriceUsdCents: Number(row.source_price_usd_cents),
    sourceCurrency: (row.source_currency as string) ?? "USD",
    markupPct: Number(row.markup_pct),
    sellPriceKesCents: Number(row.sell_price_kes_cents),
    compareAtKesCents: row.compare_at_kes_cents != null ? Number(row.compare_at_kes_cents) : null,
    weightGrams: Number(row.weight_grams),
    weightSource: (row.weight_source as string) ?? "category_default",
    hasVariants: row.has_variants as boolean,
    stockStatus: row.stock_status as string,
    viewCount: Number(row.view_count),
    orderCount: Number(row.order_count),
    rating: row.rating != null ? Number(row.rating) : null,
    reviewCount: Number(row.review_count),
    sourceRating: row.source_rating != null ? Number(row.source_rating) : null,
    sourceReviewCount: row.source_review_count != null ? Number(row.source_review_count) : null,
    isActive: row.is_active as boolean,
    isFeatured: row.is_featured as boolean,
    estimatedDaysMin: Number(row.estimated_days_min),
    estimatedDaysMax: Number(row.estimated_days_max),
    lastScrapedAt: row.last_scraped_at as string | null,
    createdAt: row.created_at as string,
  };
}

function mapVariant(row: Record<string, unknown>): ProductVariant {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    attributes: row.attributes as Record<string, string>,
    sku: row.sku as string | null,
    priceDeltaKesCents: Number(row.price_delta_kes_cents),
    stockQty: Number(row.stock_qty),
    imageUrl: row.image_url as string | null,
    isActive: row.is_active as boolean,
    sortOrder: Number(row.sort_order),
  };
}

export interface ListProductsOptions {
  categorySlug?: string;
  search?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  minRating?: number;
  featured?: boolean;
  sort?: "newest" | "popular" | "price_asc" | "price_desc" | "rating";
  page?: number;
  limit?: number;
  includeInactive?: boolean; // admin tables only — deactivated rows stay editable
}

/** Offset pagination — admin tables only. The customer feed uses feed(). */
export async function list(opts: ListProductsOptions = {}): Promise<{ products: Product[]; total: number }> {
  const { page = 1, limit = 24, sort = "newest" } = opts;
  const offset = (page - 1) * limit;

  const conditions: string[] = [opts.includeInactive ? "true" : "p.is_active = true"];
  const params: unknown[] = [];
  let pi = 1;

  if (opts.categorySlug) {
    params.push(opts.categorySlug);
    conditions.push(`c.slug = $${pi++}`);
  }
  if (opts.minPriceCents != null) {
    params.push(opts.minPriceCents);
    conditions.push(`p.sell_price_kes_cents >= $${pi++}`);
  }
  if (opts.maxPriceCents != null) {
    params.push(opts.maxPriceCents);
    conditions.push(`p.sell_price_kes_cents <= $${pi++}`);
  }
  if (opts.minRating != null) {
    params.push(opts.minRating);
    conditions.push(`p.rating >= $${pi++}`);
  }
  if (opts.featured) {
    conditions.push(`p.is_featured = true`);
  }
  if (opts.search) {
    params.push(opts.search);
    conditions.push(`p.search_vector @@ plainto_tsquery('english', $${pi++})`);
  }

  const where = conditions.join(" AND ");

  const orderMap: Record<string, string> = {
    newest:     "p.created_at DESC",
    popular:    "p.order_count DESC, p.view_count DESC",
    price_asc:  "p.sell_price_kes_cents ASC",
    price_desc: "p.sell_price_kes_cents DESC",
    rating:     "p.rating DESC NULLS LAST, p.review_count DESC",
  };
  const orderBy = orderMap[sort] ?? orderMap.newest;

  const baseQuery = `
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${where}
  `;

  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug ${baseQuery}
     ORDER BY ${orderBy} LIMIT $${pi++} OFFSET $${pi++}`,
    params,
  );

  const { rows: countRows } = await db.query(`SELECT count(*)::int AS total ${baseQuery}`, params.slice(0, -2));

  return { products: rows.map(mapProduct), total: countRows[0].total };
}

// ── Keyset feed (infinite scroll) ─────────────────────────────────────────────

export type FeedSort = "newest" | "popular" | "price_asc" | "price_desc" | "recommended";

export interface FeedOptions {
  limit: number;
  sort: FeedSort;
  cursor?: string;
  categorySlug?: string;
  search?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  /** Shuffle seed for the "recommended" sort — same seed ⇒ stable pagination. */
  seed?: string;
  /** Exclude one product (e.g. the PDP's own product from its related feed). */
  excludeId?: string;
}

interface FeedSortSpec {
  column: string;            // the sort value column
  direction: "ASC" | "DESC"; // applied to both value and id
  cast: "string" | "number";
}

const FEED_SORTS: Record<Exclude<FeedSort, "recommended">, FeedSortSpec> = {
  newest:     { column: "p.created_at",           direction: "DESC", cast: "string" },
  popular:    { column: "p.order_count",          direction: "DESC", cast: "number" },
  price_asc:  { column: "p.sell_price_kes_cents", direction: "ASC",  cast: "number" },
  price_desc: { column: "p.sell_price_kes_cents", direction: "DESC", cast: "number" },
};

function encodeCursor(value: unknown, id: string): string {
  return Buffer.from(JSON.stringify([value, id])).toString("base64url");
}

function decodeCursor(cursor: string): [unknown, string] | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[1] === "string") {
      return parsed as [unknown, string];
    }
  } catch { /* malformed cursor */ }
  return null;
}

/**
 * Cursor-based product feed: stable under concurrent inserts/deletes, O(limit)
 * at any depth, no count(*). Returns limit items + the cursor for the next page.
 */
export async function feed(opts: FeedOptions): Promise<{ products: Product[]; nextCursor: string | null }> {
  const conditions: string[] = ["p.is_active = true"];
  const params: unknown[] = [];
  let pi = 1;

  // "recommended": popularity-weighted deterministic shuffle. Each item's score
  // is log-popularity plus a per-seed pseudo-random jitter in [0,1) — sellers
  // and frequently-viewed items float up, but every seed deals a fresh order.
  // The seed is part of the score expression, so cursors paginate stably.
  let spec: FeedSortSpec;
  if (opts.sort === "recommended") {
    params.push(opts.seed ?? new Date().toISOString().slice(0, 10));
    const seedRef = `$${pi++}::text`;
    spec = {
      column:
        `(ln(1 + p.order_count * 5 + p.view_count)` +
        ` + (('x' || substr(md5(${seedRef} || p.id::text), 1, 8))::bit(32)::int / 4294967296.0 + 0.5))`,
      direction: "DESC",
      cast: "number",
    };
  } else {
    spec = FEED_SORTS[opts.sort as Exclude<FeedSort, "recommended">] ?? FEED_SORTS.newest;
  }
  const cmp = spec.direction === "DESC" ? "<" : ">";

  if (opts.excludeId) {
    params.push(opts.excludeId);
    conditions.push(`p.id <> $${pi++}::uuid`);
  }
  if (opts.categorySlug) {
    params.push(opts.categorySlug);
    conditions.push(`c.slug = $${pi++}`);
  }
  if (opts.search) {
    params.push(opts.search);
    conditions.push(`p.search_vector @@ plainto_tsquery('english', $${pi++})`);
  }
  if (opts.minPriceCents != null) {
    params.push(opts.minPriceCents);
    conditions.push(`p.sell_price_kes_cents >= $${pi++}`);
  }
  if (opts.maxPriceCents != null) {
    params.push(opts.maxPriceCents);
    conditions.push(`p.sell_price_kes_cents <= $${pi++}`);
  }

  if (opts.cursor) {
    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      const [value, id] = decoded;
      params.push(spec.cast === "number" ? Number(value) : String(value), id);
      conditions.push(`(${spec.column}, p.id) ${cmp} ($${pi++}, $${pi++}::uuid)`);
    }
  }

  params.push(opts.limit + 1);
  const { rows } = await db.query(
    `SELECT p.*, ${spec.column} AS __feed_sort_value FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY ${spec.column} ${spec.direction}, p.id ${spec.direction}
     LIMIT $${pi++}`,
    params,
  );

  const hasMore = rows.length > opts.limit;
  const pageRows = hasMore ? rows.slice(0, opts.limit) : rows;
  const products = pageRows.map(mapProduct);

  let nextCursor: string | null = null;
  if (hasMore && pageRows.length) {
    const last = pageRows[pageRows.length - 1] as Record<string, unknown>;
    const raw = last.__feed_sort_value;
    const value = raw instanceof Date ? raw.toISOString() : spec.cast === "number" ? Number(raw) : String(raw);
    nextCursor = encodeCursor(value, String(last.id));
  }

  return { products, nextCursor };
}

export async function findBySlug(slug: string): Promise<Product | null> {
  const { rows } = await db.query(
    `SELECT p.* FROM products p WHERE p.slug = $1 AND p.is_active = true`,
    [slug],
  );
  if (!rows[0]) return null;
  // Increment view count asynchronously
  db.query(`UPDATE products SET view_count = view_count + 1 WHERE id = $1`, [rows[0].id]).catch(() => null);
  return mapProduct(rows[0]);
}

export async function findById(id: string): Promise<Product | null> {
  const { rows } = await db.query(`SELECT * FROM products WHERE id = $1`, [id]);
  return rows[0] ? mapProduct(rows[0]) : null;
}

export async function getVariants(productId: string): Promise<ProductVariant[]> {
  const { rows } = await db.query(
    `SELECT * FROM product_variants WHERE product_id = $1 AND is_active = true ORDER BY sort_order`,
    [productId],
  );
  return rows.map(mapVariant);
}

export async function create(data: {
  name: string;
  description?: string;
  categoryId: string;
  brandId?: string;
  tags?: string[];
  images?: string[];
  sourcePriceUsdCents: number;
  sourceCurrency?: string;
  markupPct?: number;
  sellPriceKesCents: number;
  compareAtKesCents?: number;
  weightGrams?: number;
  weightSource?: string;
  estimatedDaysMin?: number;
  estimatedDaysMax?: number;
  sourcePlatform?: string;
  sourceUrl?: string;
  sourceId?: string;
  isFeatured?: boolean;
}): Promise<Product> {
  const slug = uniqueSlug(data.name);
  const { rows } = await db.query(
    `INSERT INTO products (
       name, slug, description, category_id, brand_id, tags, images,
       source_price_usd_cents, source_currency, markup_pct,
       sell_price_kes_cents, compare_at_kes_cents,
       weight_grams, weight_source,
       estimated_days_min, estimated_days_max,
       source_platform, source_url, source_id, is_featured
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [
      data.name,
      slug,
      data.description ?? null,
      data.categoryId,
      data.brandId ?? null,
      data.tags ?? [],
      data.images ?? [],
      data.sourcePriceUsdCents,
      data.sourceCurrency ?? "USD",
      data.markupPct ?? 20,
      data.sellPriceKesCents,
      data.compareAtKesCents ?? null,
      data.weightGrams ?? 500,
      data.weightSource ?? (data.weightGrams != null ? "manual" : "category_default"),
      data.estimatedDaysMin ?? 7,
      data.estimatedDaysMax ?? 14,
      data.sourcePlatform ?? "manual",
      data.sourceUrl ?? null,
      data.sourceId ?? null,
      data.isFeatured ?? false,
    ],
  );
  return mapProduct(rows[0]);
}

export async function update(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    categoryId: string;
    tags: string[];
    images: string[];
    sourcePriceUsdCents: number;
    sourceCurrency: string;
    markupPct: number;
    sellPriceKesCents: number;
    compareAtKesCents: number | null;
    weightGrams: number;
    weightSource: string;
    stockStatus: string;
    isActive: boolean;
    isFeatured: boolean;
    estimatedDaysMin: number;
    estimatedDaysMax: number;
  }>,
): Promise<Product | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  let pi = 2;

  const fieldMap: Record<string, string> = {
    name: "name", description: "description", categoryId: "category_id",
    tags: "tags", images: "images", sourcePriceUsdCents: "source_price_usd_cents",
    sourceCurrency: "source_currency",
    markupPct: "markup_pct", sellPriceKesCents: "sell_price_kes_cents",
    compareAtKesCents: "compare_at_kes_cents",
    weightGrams: "weight_grams", weightSource: "weight_source",
    stockStatus: "stock_status", isActive: "is_active", isFeatured: "is_featured",
    estimatedDaysMin: "estimated_days_min", estimatedDaysMax: "estimated_days_max",
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) {
      sets.push(`${col} = $${pi++}`);
      params.push((data as Record<string, unknown>)[key]);
    }
  }

  if (!sets.length) return findById(id);

  sets.push(`updated_at = now()`);
  const { rows } = await db.query(
    `UPDATE products SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
    params,
  );
  return rows[0] ? mapProduct(rows[0]) : null;
}

/**
 * Permanently delete a product. Variants/cart/wishlist lines cascade, but
 * order_items.product_id deliberately RESTRICTs — a product that has ever
 * been ordered can't be hard-deleted (order history must survive). In that
 * case this returns false and callers fall back to deactivation.
 */
export async function hardDelete(id: string): Promise<boolean> {
  try {
    const { rowCount } = await db.query(`DELETE FROM products WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  } catch (err) {
    console.warn(`[products] hard delete failed for ${id}, falling back to deactivate:`, err);
    return false;
  }
}

export async function addVariant(
  productId: string,
  data: { attributes: Record<string, string>; sku?: string; priceDeltaKesCents?: number; stockQty?: number; imageUrl?: string },
): Promise<ProductVariant> {
  const variantKey = canonicalVariantKey(data.attributes);
  const { rows } = await db.query(
    `INSERT INTO product_variants (product_id, attributes, variant_key, sku, price_delta_kes_cents, stock_qty, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (product_id, variant_key) DO UPDATE
       SET sku = EXCLUDED.sku,
           price_delta_kes_cents = EXCLUDED.price_delta_kes_cents,
           stock_qty = EXCLUDED.stock_qty,
           image_url = EXCLUDED.image_url,
           is_active = true
     RETURNING *`,
    [
      productId,
      JSON.stringify(data.attributes),
      variantKey,
      data.sku ?? null,
      data.priceDeltaKesCents ?? 0,
      data.stockQty ?? 0,
      data.imageUrl ?? null,
    ],
  );
  await db.query(`UPDATE products SET has_variants = true WHERE id = $1`, [productId]);
  return mapVariant(rows[0]);
}

/** Deterministic variant identity: stable across re-scrapes for the same attribute set. */
export function canonicalVariantKey(attributes: Record<string, string>): string {
  const sorted = Object.keys(attributes).sort().map((k) => [k, attributes[k]]);
  return JSON.stringify(sorted);
}

export async function getCategories(): Promise<{ id: string; name: string; slug: string; parentId: string | null; icon: string | null; imageUrl: string | null; sortOrder: number; productCount: number; previewImage: string | null }[]> {
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.slug, c.parent_id, c.icon, c.image_url, c.sort_order,
            count(p.id)::int AS product_count,
            (SELECT p2.images[1] FROM products p2
             WHERE p2.category_id = c.id AND p2.is_active AND array_length(p2.images, 1) > 0
             ORDER BY p2.order_count DESC, p2.created_at DESC LIMIT 1) AS preview_image
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id AND p.is_active
     WHERE c.is_active = true
     GROUP BY c.id
     ORDER BY c.sort_order, c.name`,
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    parentId: r.parent_id as string | null,
    icon: r.icon as string | null,
    imageUrl: r.image_url as string | null,
    sortOrder: r.sort_order as number,
    productCount: Number(r.product_count),
    previewImage: r.preview_image as string | null,
  }));
}

export async function updateRatingCache(productId: string): Promise<void> {
  await db.query(
    `UPDATE products
     SET rating       = (SELECT avg(rating)::numeric(3,1) FROM reviews WHERE product_id = $1 AND status = 'approved'),
         review_count = (SELECT count(*) FROM reviews WHERE product_id = $1 AND status = 'approved'),
         updated_at   = now()
     WHERE id = $1`,
    [productId],
  );
}
