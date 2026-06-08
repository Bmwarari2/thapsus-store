import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev_secret_change_in_prod";

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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function authOptional(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.slice(7), JWT_SECRET) as AuthPayload;
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
