/**
 * Image pipeline: download from source URL → encode WebP at 320/640/1280 →
 * upload to Cloudflare R2 → return the 640w CDN URL (siblings derive by
 * convention: …_640.webp ↔ …_320.webp / …_1280.webp).
 *
 * Grid cards load the 320/640 variants instead of multi-MB source originals.
 * Downloads use a real browser UA + referer (image CDNs block bot strings).
 * When a download fails the image is skipped and the failure recorded in
 * admin_logs — only if NOTHING could be processed do we fall back to the
 * source URLs so a product is never left imageless.
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { db } from "./db.js";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const IMAGE_WIDTHS = [320, 640, 1280] as const;
const PRIMARY_WIDTH = 640;

let _s3: S3Client | null = null;

function getS3(): S3Client | null {
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_ENDPOINT) return null;
  if (!_s3) {
    _s3 = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _s3;
}

// Keyed by a hash of the source URL (not gallery position) so re-scrapes with
// a reordered gallery still hit the skip-if-exists path.
function r2Key(productId: string, sourceUrl: string, width: number): string {
  const hash = createHash("sha1").update(sourceUrl).digest("hex").slice(0, 16);
  return `products/${productId}/${hash}_${width}.webp`;
}

function cdnUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL ?? "";
  return `${base}/${key}`;
}

/**
 * Normalize source image URLs into a fetchable absolute URL.
 * Many sources (e.g. SHEIN / ltwebstatic) return protocol-relative URLs
 * like "//img.ltwebstatic.com/..." which Node's fetch() cannot parse.
 */
function normalizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return trimmed;
}

async function alreadyUploaded(s3: S3Client, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function downloadImage(sourceUrl: string): Promise<Buffer | null> {
  const res = await fetch(sourceUrl, {
    headers: {
      "User-Agent": BROWSER_UA,
      Referer: new URL(sourceUrl).origin + "/",
      Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.warn(`[images] failed to fetch ${sourceUrl}: ${res.status}`);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

async function recordImageFailure(productId: string, sourceUrl: string, reason: string): Promise<void> {
  await db.query(
    `INSERT INTO admin_logs (actor_id, action, entity, entity_id, meta)
     VALUES (NULL, 'needs_image_refresh', 'product', $1, $2)`,
    [productId, JSON.stringify({ source_url: sourceUrl, reason })],
  ).catch((err) => console.error("[images] failed to record image failure:", err));
}

export async function uploadProductImages(
  productId: string,
  sourceUrls: string[],
): Promise<string[]> {
  const s3 = getS3();

  // No R2 configured — return originals (dev mode)
  if (!s3) {
    console.warn("[images] R2 not configured, using source URLs directly");
    return sourceUrls;
  }

  const cdnUrls: string[] = [];

  for (const rawUrl of sourceUrls) {
    const sourceUrl = normalizeImageUrl(rawUrl);
    const primaryKey = r2Key(productId, sourceUrl, PRIMARY_WIDTH);

    try {
      // Variants are written together, so the primary existing ⇒ all exist.
      if (await alreadyUploaded(s3, primaryKey)) {
        cdnUrls.push(cdnUrl(primaryKey));
        continue;
      }

      const original = await downloadImage(sourceUrl);
      if (!original) {
        await recordImageFailure(productId, sourceUrl, "download_failed");
        continue;
      }

      const meta = await sharp(original).metadata();
      const originalWidth = meta.width ?? PRIMARY_WIDTH;

      for (const width of IMAGE_WIDTHS) {
        const pipeline = sharp(original).rotate(); // honour EXIF orientation
        // Never upscale — encode at the original size for widths beyond it.
        const resized = width < originalWidth ? pipeline.resize({ width }) : pipeline;
        const webp = await resized.webp({ quality: width <= 320 ? 70 : 78 }).toBuffer();

        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET!,
            Key: r2Key(productId, sourceUrl, width),
            Body: webp,
            ContentType: "image/webp",
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );
      }

      cdnUrls.push(cdnUrl(primaryKey));
    } catch (err) {
      console.error(`[images] error processing image for product ${productId}:`, err);
      await recordImageFailure(productId, sourceUrl, err instanceof Error ? err.message : String(err));
    }
  }

  // Everything failed — keep the catalog usable rather than imageless.
  if (!cdnUrls.length && sourceUrls.length) {
    console.warn(`[images] all ${sourceUrls.length} images failed for product ${productId}; falling back to source URLs`);
    return sourceUrls.map(normalizeImageUrl);
  }

  return cdnUrls;
}
