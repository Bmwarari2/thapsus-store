/**
 * Migration runner.
 * Usage:  node scripts/migrate.mjs
 * Requires DATABASE_URL in environment (or .env.local).
 *
 * Reads all *.sql files from supabase/migrations/ in alphabetical order
 * and runs any that haven't been applied yet, tracked in a migrations table.
 */

import { createRequire } from "module";
import { readdir, readFile } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const require = createRequire(import.meta.url);
const pg = require("pg");

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local if present
config({ path: resolve(__dirname, "../.env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

async function run() {
  await client.connect();
  console.log("✅  Connected to database.");

  // Create migrations tracking table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         bigserial   PRIMARY KEY,
      filename   text        UNIQUE NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const migrationsDir = resolve(__dirname, "../supabase/migrations");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows: applied } = await client.query(
    `SELECT filename FROM _migrations`
  );
  const appliedSet = new Set(applied.map((r) => r.filename));

  const pending = files.filter((f) => !appliedSet.has(f));

  if (pending.length === 0) {
    console.log("✅  No pending migrations.");
    await client.end();
    return;
  }

  for (const file of pending) {
    const sql = await readFile(resolve(migrationsDir, file), "utf8");
    console.log(`⏳  Applying ${file}...`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(`INSERT INTO _migrations (filename) VALUES ($1)`, [file]);
      await client.query("COMMIT");
      console.log(`✅  Applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`❌  Failed on ${file}:`, err.message);
      await client.end();
      process.exit(1);
    }
  }

  console.log(`\n🎉  All migrations applied (${pending.length} file${pending.length > 1 ? "s" : ""}).`);
  await client.end();
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
