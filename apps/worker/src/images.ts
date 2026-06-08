/**
 * Image pipeline: download from source URL → upload to Cloudflare R2 → return CDN URL.
 * Falls back to the original URL if R2 is not configured (useful in development).
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

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

function r2Key(productId: string, index: number, ext = "jpg"): string {
  return `products/${productId}/${index}.${ext}`;
}

function cdnUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL ?? "";
  return `${base}/${key}`;
}

function extFromUrl(url: string): string {
  const m = url.split("?")[0].match(/\.(\w{2,4})$/);
  return m?.[1]?.toLowerCase() ?? "jpg";
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

  for (let i = 0; i < sourceUrls.length; i++) {
    const sourceUrl = normalizeImageUrl(sourceUrls[i]);
    const ext = extFromUrl(sourceUrl);
    const key = r2Key(productId, i, ext);

    try {
      // Skip re-upload if already exists
      if (await alreadyUploaded(s3, key)) {
        cdnUrls.push(cdnUrl(key));
        continue;
      }

      const res = await fetch(sourceUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ThapsusBot/1.0)" },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        console.warn(`[images] failed to fetch ${sourceUrl}: ${res.status}`);
        cdnUrls.push(sourceUrl); // fallback to original
        continue;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") ?? "image/jpeg";

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET!,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );

      cdnUrls.push(cdnUrl(key));
    } catch (err) {
      console.error(`[images] error uploading image ${i} for product ${productId}:`, err);
      cdnUrls.push(sourceUrl); // fallback
    }
  }

  return cdnUrls;
}
