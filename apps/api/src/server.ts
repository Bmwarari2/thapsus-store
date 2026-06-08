import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env.local") });

import { authOptional, idempotency, envelope } from "./middleware.js";
import authRoutes     from "./routes/auth.js";
import productRoutes  from "./routes/products.js";
import searchRoutes   from "./routes/search.js";
import cartRoutes     from "./routes/cart.js";
import orderRoutes    from "./routes/orders.js";
import reviewRoutes   from "./routes/reviews.js";
import customerRoutes from "./routes/customer.js";
import adminRoutes    from "./routes/admin.js";
import paymentRoutes  from "./routes/payments.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.set("trust proxy", 1); // Required when behind Railway / Cloudflare proxy

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "rate_limited", message: "Too many requests, please try again later." } },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // strict — prevents brute force on login/signup
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "rate_limited", message: "Too many attempts, please try again in 15 minutes." } },
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 STK pushes per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "rate_limited", message: "Too many payment requests, please slow down." } },
});

app.use("/api/v1", generalLimiter);
app.use(cors({
  origin: process.env.WEB_BASE_URL ?? true,
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
}));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("tiny"));
app.use(authOptional);
app.use(idempotency);

// ── API routes ────────────────────────────────────────────────────────────────

const v1 = express.Router();

v1.use("/auth",                      authLimiter, authRoutes);
v1.use("/payments/mpesa/initiate",   paymentLimiter);
v1.use("/products",                  productRoutes);
v1.use("/search",                    searchRoutes);
v1.use("/cart",                      cartRoutes);
v1.use("/orders",                    orderRoutes);
v1.use("/reviews",                   reviewRoutes);
v1.use("/me",                        customerRoutes);
v1.use("/admin",                     adminRoutes);
v1.use("/payments",                  paymentRoutes);

v1.get("/categories", async (_req, res) => {
  const { getCategories } = await import("./repos/products.js");
  res.json(envelope(await getCategories()));
});

v1.get("/health", (_req, res) =>
  res.json(envelope({ status: "ok", time: new Date().toISOString() })),
);

app.use("/api/v1", v1);
app.get("/healthz", (_req, res) => res.type("text/plain").send("ok"));

// ── SPA fallback ──────────────────────────────────────────────────────────────

const candidates = [
  resolve(__dirname, "../../web/dist"),
  resolve(__dirname, "../../../apps/web/dist"),
  resolve(process.cwd(), "apps/web/dist"),
];
const WEB_DIST = process.env.WEB_DIST_OVERRIDE
  ? resolve(process.env.WEB_DIST_OVERRIDE)
  : candidates.find((c) => existsSync(`${c}/index.html`)) ?? null;

if (WEB_DIST) {
  console.log(`[api] serving SPA from ${WEB_DIST}`);
  app.use("/assets", express.static(`${WEB_DIST}/assets`, { immutable: true, maxAge: "1y" }));
  app.use(express.static(WEB_DIST, { index: false, maxAge: 0 }));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(`${WEB_DIST}/index.html`);
  });
} else {
  app.get("/", (_req, res) => res.json(envelope({ name: "thapsus-api", version: "1.0.0" })));
}

// ── Error handling ────────────────────────────────────────────────────────────

app.use((req, res) =>
  res.status(404).json({ ok: false, error: { code: "not_found", message: `No route ${req.method} ${req.path}` } }),
);

app.use(((err, req, res, _next) => {
  const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
  console.error(`[api] ${req.method} ${req.path}:`, err);
  if (res.headersSent) return;
  res.status(statusCode).json({
    ok: false,
    error: {
      code: "internal",
      message: process.env.NODE_ENV === "production" ? "Something went wrong." : err?.message ?? "Unknown error",
    },
  });
}) as express.ErrorRequestHandler);

process.on("unhandledRejection", (err) => console.error("[api] unhandledRejection:", err));
process.on("uncaughtException",  (err) => console.error("[api] uncaughtException:", err));

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`[api] listening on http://localhost:${port}`));

export default app;
