import { Queue } from "bullmq";

let _importQueue: Queue | null = null;

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

export function getImportQueue(): Queue {
  if (!_importQueue) {
    _importQueue = new Queue("imports", { connection: redisOpts() });
  }
  return _importQueue;
}
