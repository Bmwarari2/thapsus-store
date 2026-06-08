/**
 * Worker entry point.
 * Starts:
 *   1. BullMQ Worker — processes import_jobs from the queue
 *   2. Scheduled jobs — exchange rate (daily) + new-arrivals scrape (weekly)
 */

import { Worker, Queue } from "bullmq";
import { createServer } from "node:http";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env.local") });

import { processImportJob, type ImportJobPayload } from "./jobs/import.js";
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

const worker = new Worker<ImportJobPayload>(
  "imports",
  async (job) => {
    console.log(`[worker] processing job ${job.id} — type: ${job.name}`);

    if (job.name === "import-product") {
      await processImportJob(job);
    } else if (job.name === "exchange-rate") {
      await updateExchangeRate();
    } else {
      console.warn(`[worker] unknown job name: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 2,        // Process 2 import jobs at a time
    limiter: {
      max: 10,             // Max 10 jobs per 30 seconds (respects Oxylabs rate limits)
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

  // Auto-scrape new arrivals: AliExpress women's fashion — weekly Monday 03:00 EAT
  const { rows: cats } = await db.query(
    `SELECT id FROM categories WHERE slug = 'clothing' LIMIT 1`,
  );
  const clothingCategoryId = cats[0]?.id;

  if (clothingCategoryId) {
    // Insert a queued import_job for this week if it doesn't already exist
    await db.query(
      `INSERT INTO import_jobs (source_platform, search_query, category_id, scheduled_at, status)
       SELECT 'aliexpress', 'women fashion dress 2024', $1, now(), 'queued'
       WHERE NOT EXISTS (
         SELECT 1 FROM import_jobs
         WHERE source_platform = 'aliexpress'
           AND search_query = 'women fashion dress 2024'
           AND created_at > now() - interval '7 days'
       )`,
      [clothingCategoryId],
    );
  }

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

async function start(): Promise<void> {
  console.log("[worker] starting Thapsus scraping worker...");

  startHealthServer();

  try {
    await registerScheduledJobs();
  } catch (err) {
    console.error("[worker] failed to register scheduled jobs:", err);
  }

  console.log("[worker] listening for jobs on queue: imports");
}

start().catch((err) => {
  console.error("[worker] startup error:", err);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM received, closing gracefully...");
  await worker.close();
  await scheduleQueue.close();
  await db.end();
  process.exit(0);
});

process.on("unhandledRejection", (err) => console.error("[worker] unhandledRejection:", err));
