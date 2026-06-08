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
  markupPct: number;
  shippingFeeKesCents: number;
  taxKesCents: number;
  sellPriceKesCents: number;
  hasVariants: boolean;
  stockStatus: string;
  viewCount: number;
  orderCount: number;
  rating: number | null;
  reviewCount: number;
  isActive: boolean;
  isFeatured: boolean;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  lastScrapedAt: string | null;
  createdAt: string;
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
    markupPct: Number(row.markup_pct),
    shippingFeeKesCents: Number(row.shipping_fee_kes_cents),
    taxKesCents: Number(row.tax_kes_cents),
    sellPriceKesCents: Number(row.sell_price_kes_cents),
    hasVariants: row.has_variants as boolean,
    stockStatus: row.stock_status as string,
    viewCount: Number(row.view_count),
    orderCount: Number(row.order_count),
    rating: row.rating != null ? Number(row.rating) : null,
    reviewCount: Number(row.review_count),
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
}

export async function list(opts: ListProductsOptions = {}): Promise<{ products: Product[]; total: number }> {
  const { page = 1, limit = 24, sort = "newest" } = opts;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["p.is_active = true"];
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
  markupPct?: number;
  shippingFeeKesCents: number;
  taxKesCents: number;
  sellPriceKesCents: number;
  weightGrams?: number;
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
       source_price_usd_cents, markup_pct, shipping_fee_kes_cents,
       tax_kes_cents, sell_price_kes_cents, estimated_days_min,
       estimated_days_max, source_platform, source_url, source_id, is_featured
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
      data.markupPct ?? 5,
      data.shippingFeeKesCents,
      data.taxKesCents,
      data.sellPriceKesCents,
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
    markupPct: number;
    shippingFeeKesCents: number;
    taxKesCents: number;
    sellPriceKesCents: number;
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
    markupPct: "markup_pct", shippingFeeKesCents: "shipping_fee_kes_cents",
    taxKesCents: "tax_kes_cents", sellPriceKesCents: "sell_price_kes_cents",
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

export async function addVariant(
  productId: string,
  data: { attributes: Record<string, string>; sku?: string; priceDeltaKesCents?: number; stockQty?: number; imageUrl?: string },
): Promise<ProductVariant> {
  const { rows } = await db.query(
    `INSERT INTO product_variants (product_id, attributes, sku, price_delta_kes_cents, stock_qty, image_url)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      productId,
      JSON.stringify(data.attributes),
      data.sku ?? null,
      data.priceDeltaKesCents ?? 0,
      data.stockQty ?? 0,
      data.imageUrl ?? null,
    ],
  );
  await db.query(`UPDATE products SET has_variants = true WHERE id = $1`, [productId]);
  return mapVariant(rows[0]);
}

export async function getCategories(): Promise<{ id: string; name: string; slug: string; parentId: string | null; icon: string | null; imageUrl: string | null; sortOrder: number }[]> {
  const { rows } = await db.query(
    `SELECT id, name, slug, parent_id, icon, image_url, sort_order
     FROM categories WHERE is_active = true ORDER BY sort_order, name`,
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    parentId: r.parent_id as string | null,
    icon: r.icon as string | null,
    imageUrl: r.image_url as string | null,
    sortOrder: r.sort_order as number,
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
