import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getAuthGate } from "./repos/users.js";

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production — refusing to boot with a fallback secret");
  }
  return "dev_only_secret";
}

const JWT_SECRET = resolveJwtSecret();

// ── Response helpers ──────────────────────────────────────────────────────────

export function envelope<T>(data: T) {
  return { ok: true, data };
}

export function errorEnvelope(code: string, message: string, details?: unknown) {
  return { ok: false, error: { code, message, details } };
}

// ── JWT auth ──────────────────────────────────────────────────────────────────

export interface AuthPayload {
  id: string;
  email: string;
  role: "customer" | "admin";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export async function authOptional(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET) as AuthPayload & { iat?: number };
      // Reject tokens minted before the last password change, and tokens for
      // deactivated accounts (gate data is cached 60s per user).
      const gate = await getAuthGate(payload.id);
      const issuedAtMs = (payload.iat ?? 0) * 1000;
      // 1s tolerance: jwt iat is floored to the second.
      const valid =
        gate?.isActive &&
        (gate.passwordChangedAt == null || issuedAtMs >= gate.passwordChangedAt - 1000);
      if (valid) {
        req.user = { id: payload.id, email: payload.email, role: payload.role };
      }
    } catch {
      // invalid token — treat as unauthenticated
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json(errorEnvelope("unauthorized", "Authentication required"));
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json(errorEnvelope("forbidden", "Admin access required"));
    return;
  }
  next();
}

// ── Idempotency ───────────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      idemKey?: string;
    }
  }
}

export function idempotency(req: Request, _res: Response, next: NextFunction) {
  req.idemKey = req.headers["idempotency-key"] as string | undefined;
  next();
}
