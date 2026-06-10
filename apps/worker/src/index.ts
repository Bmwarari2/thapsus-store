/**
 * Worker entry point.
 * Starts:
 *   1. BullMQ Worker — imports, single-product refreshes, exchange-rate updates
 *   2. Scheduled jobs — exchange rate (daily) + auto-scrape (weekly)
 *   3. Stranded-job sweep — re-enqueues import_jobs rows stuck in 'queued'
 *      (covers API-side enqueue failures and scheduler inserts)
 */

import { Worker, Queue } from "bullmq";
import { createServer } from "node:http";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env.local") });

import {
  processImportJob,
  processRefreshProduct,
  type ImportJobPayload,
  type RefreshProductPayload,
} from "./jobs/import.js";
import { updateExchangeRate } from "./jobs/exchange-rate.js";
import { db } from "./db.js";

// ── Redis connection options ───────────────────────────────────────────────────

function redisOpts() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

const connection = redisOpts();

// ── BullMQ Worker ─────────────────────────────────────────────────────────────

const worker = new Worker<ImportJobPayload | RefreshProductPayload>(
  "imports",
  async (job) => {
    console.log(`[worker] processing job ${job.id} — type: ${job.name}`);

    if (job.name === "import-product") {
      await processImportJob(job as Parameters<typeof processImportJob>[0]);
    } else if (job.name === "refresh-product") {
      await processRefreshProduct(job as Parameters<typeof processRefreshProduct>[0]);
    } else if (job.name === "exchange-rate") {
      await updateExchangeRate();
    } else {
      console.warn(`[worker] unknown job name: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 2,
    lockDuration: 600_000,  // 10 min lock — search jobs fetch N products sequentially
    limiter: {
      max: 10,
      duration: 30_000,
    },
  },
);

worker.on("completed", (job) => {
  console.log(`[worker] job ${job.id} (${job.name}) completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} (${job?.name}) failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[worker] worker error:", err);
});

// ── Scheduled Jobs ────────────────────────────────────────────────────────────

const scheduleQueue = new Queue("imports", { connection });

async function registerScheduledJobs(): Promise<void> {
  // Exchange rate update — daily at 02:00 EAT (UTC+3 = 23:00 UTC)
  await scheduleQueue.add(
    "exchange-rate",
    {},
    {
      repeat: { pattern: "0 23 * * *" },
      jobId: "scheduled-exchange-rate",
    },
  );

  // Run once at startup so a fresh deploy prices with current rates.
  await scheduleQueue.add(
    "exchange-rate",
    {},
    {
      delay: 0,
      jobId: "startup-exchange-rate",
    },
  );

  console.log("[worker] scheduled jobs registered");
}

/**
 * Weekly auto-scrape: inserts an import_jobs row AND enqueues it (the old
 * version inserted the row but never enqueued anything, so it sat 'queued'
 * forever). The query is config-driven — no hardcoded seasonal strings.
 */
async function maybeScheduleWeeklyScrape(): Promise<void> {
  const { rows: cfgRows } = await db.query(
    `SELECT value FROM pricing_config WHERE key = 'scheduled_search_query'`,
  );
  const query = cfgRows[0]?.value?.trim();
  if (!query) return;

  const { rows: cats } = await db.query(
    `SELECT id FROM categories WHERE slug = 'clothing' LIMIT 1`,
  );
  const categoryId = cats[0]?.id ?? null;

  const { rows: [job] } = await db.query(
    `INSERT INTO import_jobs (source_platform, search_query, category_id, scheduled_at, status)
     SELECT 'aliexpress', $1, $2, now(), 'queued'
     WHERE NOT EXISTS (
       SELECT 1 FROM import_jobs
       WHERE source_platform = 'aliexpress'
         AND search_query = $1
         AND created_at > now() - interval '7 days'
     )
     RETURNING id`,
    [query, categoryId],
  );

  if (job) {
    await scheduleQueue.add("import-product", { jobId: job.id }, { jobId: job.id });
    console.log(`[worker] weekly scrape scheduled: "${query}" (job ${job.id})`);
  }
}

// ── Stranded-job sweep ────────────────────────────────────────────────────────
// Re-enqueues import_jobs rows that are 'queued' in the DB but unknown to
// BullMQ (API enqueue failure, Redis flush, …). jobId = row id keeps this
// idempotent: adding an already-known job is a no-op.

async function sweepStrandedJobs(): Promise<void> {
  try {
    const { rows } = await db.query(
      `SELECT id FROM import_jobs
       WHERE status = 'queued' AND created_at < now() - interval '2 minutes'
       ORDER BY created_at
       LIMIT 50`,
    );
    for (const row of rows) {
      await scheduleQueue.add("import-product", { jobId: row.id }, { jobId: row.id });
    }
    if (rows.length) console.log(`[worker] sweep re-enqueued ${rows.length} stranded job(s)`);
  } catch (err) {
    console.error("[worker] stranded-job sweep failed:", err);
  }
}

// ── Health server ─────────────────────────────────────────────────────────────
// The worker is not an HTTP service, but Railway's deploy healthcheck probes
// /healthz. Expose a minimal endpoint so the deployment is marked healthy.

function startHealthServer(): void {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port, () => {
    console.log(`[worker] health server listening on :${port}`);
  });
}

// ── Startup ───────────────────────────────────────────────────────────────────

let sweepTimer: NodeJS.Timeout | null = null;

async function start(): Promise<void> {
  console.log("[worker] starting Thapsus scraping worker...");

  startHealthServer();

  try {
    await registerScheduledJobs();
    await maybeScheduleWeeklyScrape();
  } catch (err) {
    console.error("[worker] failed to register scheduled jobs:", err);
  }

  await sweepStrandedJobs();
  sweepTimer = setInterval(sweepStrandedJobs, 10 * 60 * 1000);

  console.log("[worker] listening for jobs on queue: imports");
}

start().catch((err) => {
  console.error("[worker] startup error:", err);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM received, closing gracefully...");
  if (sweepTimer) clearInterval(sweepTimer);
  await worker.close();
  await scheduleQueue.close();
  await db.end();
  process.exit(0);
});

process.on("unhandledRejection", (err) => console.error("[worker] unhandledRejection:", err));
