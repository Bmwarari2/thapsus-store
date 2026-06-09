/**
 * Oxylabs Realtime API client.
 * Handles authentication, retries, and rate-limit back-off.
 */

const OXYLABS_URL = "https://realtime.oxylabs.io/v1/queries";
const MAX_RETRIES = 3;

function getAuth(): string {
  const user = process.env.OXYLABS_USERNAME;
  const pass = process.env.OXYLABS_PASSWORD;
  if (!user || !pass) throw new Error("OXYLABS_USERNAME / OXYLABS_PASSWORD not set");
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface OxyResponse {
  results: Array<{
    content: unknown;
    status_code: number;
    url: string;
  }>;
}

export async function oxyRequest(payload: Record<string, unknown>): Promise<OxyResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(OXYLABS_URL, {
        method: "POST",
        headers: {
          Authorization: getAuth(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120_000),
      });

      if (res.status === 429) {
        const wait = attempt * 10_000;
        console.warn(`[oxylabs] rate limited, waiting ${wait}ms (attempt ${attempt})`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Oxylabs HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      return (await res.json()) as OxyResponse;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await sleep(attempt * 2_000);
      }
    }
  }

  throw lastError ?? new Error("Oxylabs request failed after retries");
}

// ── Alibaba ───────────────────────────────────────────────────────────────────

export async function fetchAlibabaProduct(url: string): Promise<unknown> {
  // alibaba_product requires product_id, not url
  // URL formats: /product-detail/Name_1600123456789.html  or  /product-detail/1600123456789.html
  const match = url.match(/[_\/](\d{8,})(?:\.html)?/);
  const productId = match?.[1];
  if (!productId) throw new Error(`Cannot extract product_id from Alibaba URL: ${url}`);
  const data = await oxyRequest({ source: "alibaba_product", product_id: productId, parse: true });
  return data.results[0]?.content ?? null;
}

export async function fetchAlibabaSearch(query: string): Promise<unknown[]> {
  // alibaba_search requires query, not url
  const data = await oxyRequest({ source: "alibaba_search", query, parse: true });
  const content = data.results[0]?.content as { items?: unknown[] } | null;
  return content?.items ?? [];
}

// ── AliExpress ────────────────────────────────────────────────────────────────

export async function fetchAliExpressProduct(url: string): Promise<unknown> {
  // aliexpress_product requires product_id, not url
  // URL format: /item/1005003716408296.html
  const match = url.match(/\/(\d{10,})(?:\.html)?/);
  const productId = match?.[1];
  if (!productId) throw new Error(`Cannot extract product_id from AliExpress URL: ${url}`);
  const data = await oxyRequest({ source: "aliexpress_product", product_id: productId, parse: true });
  return data.results[0]?.content ?? null;
}

export async function fetchAliExpressSearch(query: string): Promise<unknown[]> {
  // aliexpress_search requires query, not url
  const data = await oxyRequest({ source: "aliexpress_search", query, parse: true });
  const content = data.results[0]?.content as { products?: unknown[] } | null;
  return content?.products ?? [];
}

// ── Shein (universal renderer) ────────────────────────────────────────────────

export async function fetchSheinProduct(url: string): Promise<string> {
  const data = await oxyRequest({
    source: "universal",
    url,
    render: "html",
    parse: false,
  });
  return (data.results[0]?.content as string) ?? "";
}

export async function fetchSheinSearch(query: string): Promise<string> {
  // Use the UK storefront to match the working product pages.
  const searchUrl = `https://www.shein.co.uk/pdsearch/${encodeURIComponent(query)}/`;

  // Attempt 1: rendered HTML (matches the product-page approach).
  const a = await oxyRequest({ source: "universal", url: searchUrl, render: "html", parse: false });
  const ra = a.results[0];
  const ca = (ra?.content as string) ?? "";
  console.log(`[shein:search:diag] render=html status=${ra?.status_code} len=${ca.length} resp=${JSON.stringify(a).slice(0, 400)}`);
  if (ca.length > 1000) return ca;

  // Attempt 2: no render — SHEIN server-renders gbRawData, so raw HTML may suffice
  // and avoids render-time faults (Oxylabs 613).
  const b = await oxyRequest({ source: "universal", url: searchUrl, parse: false });
  const rb = b.results[0];
  const cb = (rb?.content as string) ?? "";
  console.log(`[shein:search:diag] no-render status=${rb?.status_code} len=${cb.length}`);
  return cb.length ? cb : ca;
}
