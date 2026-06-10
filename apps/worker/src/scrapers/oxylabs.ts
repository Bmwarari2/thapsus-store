/**
 * Oxylabs Realtime API client.
 * Handles authentication, retries, rate-limit back-off, a daily spend budget
 * (pricing_config.scrape_daily_budget), and a per-call ledger (scrape_calls).
 */

import { db } from "../db.js";

const OXYLABS_URL = "https://realtime.oxylabs.io/v1/queries";
const MAX_RETRIES = 3;

export class BudgetExceededError extends Error {
  constructor(used: number, budget: number) {
    super(`Daily scrape budget exceeded (${used}/${budget} Oxylabs calls today)`);
    this.name = "BudgetExceededError";
  }
}

function getAuth(): string {
  const user = process.env.OXYLABS_USERNAME;
  const pass = process.env.OXYLABS_PASSWORD;
  if (!user || !pass) throw new Error("OXYLABS_USERNAME / OXYLABS_PASSWORD not set");
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function assertWithinBudget(): Promise<void> {
  const [{ rows: cfgRows }, { rows: usedRows }] = await Promise.all([
    db.query(`SELECT value FROM pricing_config WHERE key = 'scrape_daily_budget'`),
    db.query(`SELECT count(*)::int AS used FROM scrape_calls WHERE created_at >= date_trunc('day', now())`),
  ]);
  const budget = Number(cfgRows[0]?.value ?? 400);
  const used = usedRows[0].used as number;
  if (used >= budget) throw new BudgetExceededError(used, budget);
}

async function logCall(source: string, ok: boolean, jobId?: string): Promise<void> {
  await db.query(
    `INSERT INTO scrape_calls (provider, source, job_id, ok) VALUES ('oxylabs', $1, $2, $3)`,
    [source, jobId ?? null, ok],
  ).catch((err) => console.error("[oxylabs] failed to log scrape call:", err));
}

export interface OxyResponse {
  results: Array<{
    content: unknown;
    status_code: number;
    url: string;
  }>;
}

/** The import job currently running sets this so calls are attributed to it. */
let currentJobId: string | undefined;
export function setScrapeJobContext(jobId: string | undefined): void {
  currentJobId = jobId;
}

export async function oxyRequest(payload: Record<string, unknown>): Promise<OxyResponse> {
  await assertWithinBudget();

  const source = String(payload.source ?? "unknown");
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

      const data = (await res.json()) as OxyResponse;
      await logCall(source, true, currentJobId);
      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await sleep(attempt * 2_000);
      }
    }
  }

  await logCall(source, false, currentJobId);
  throw lastError ?? new Error("Oxylabs request failed after retries");
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
  const content = data.results[0]?.content as
    | { products?: unknown[]; results?: unknown[]; items?: unknown[] }
    | null;
  const products = content?.products ?? content?.results ?? content?.items ?? [];
  if (!products.length && content) {
    // Payload shape drifted — log the keys so the next failure is diagnosable.
    console.warn(
      `[oxylabs] aliexpress_search returned no products; content keys: ${Object.keys(content).join(", ")}`,
    );
  }
  return products;
}

// ── Shein (universal renderer) ────────────────────────────────────────────────

/**
 * Canonicalize SHEIN product URLs: force the www desktop host (mobile pages
 * ship different markup) and drop tracking query params, which make renders
 * flakier and bloat the URL.
 */
export function canonicalSheinUrl(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)shein\./i.test(u.hostname)) {
      u.hostname = "www.shein.co.uk";
      u.search = "";
      u.hash = "";
    }
    return u.toString();
  } catch {
    return url;
  }
}

export async function fetchSheinProduct(url: string): Promise<string> {
  const data = await oxyRequest({
    source: "universal",
    url: canonicalSheinUrl(url),
    render: "html",
    parse: false,
  });
  return (data.results[0]?.content as string) ?? "";
}

export async function fetchSheinSearch(query: string): Promise<string> {
  // UK storefront to match the product pages (GBP pricing).
  const searchUrl = `https://www.shein.co.uk/pdsearch/${encodeURIComponent(query)}/`;

  // Rendered HTML first; SHEIN also server-renders gbRawData, so fall back to
  // the raw document when rendering faults (Oxylabs 613).
  const rendered = await oxyRequest({ source: "universal", url: searchUrl, render: "html", parse: false });
  const renderedHtml = (rendered.results[0]?.content as string) ?? "";
  if (renderedHtml.length > 1000) return renderedHtml;

  const raw = await oxyRequest({ source: "universal", url: searchUrl, parse: false });
  const rawHtml = (raw.results[0]?.content as string) ?? "";
  return rawHtml.length ? rawHtml : renderedHtml;
}
