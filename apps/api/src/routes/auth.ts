import { Router, type Router as RouterType } from "express";
import crypto from "node:crypto";
import { SignupSchema, LoginSchema } from "@thapsus/shared";
import { envelope, errorEnvelope, signToken, requireAuth } from "../middleware.js";
import * as users from "../repos/users.js";
import { sendWelcome, sendPasswordReset } from "../services/email.js";

const r: RouterType = Router();

r.post("/signup", async (req, res) => {
  const parsed = SignupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorEnvelope("validation", "Invalid input", parsed.error.flatten()));
  }
  const { email, password, fullName, phone, referralCode } = parsed.data;

  const existing = await users.findByEmail(email);
  if (existing) {
    return res.status(409).json(errorEnvelope("conflict", "An account with this email already exists"));
  }

  const user = await users.create({ email, password, fullName, phone, referredByCode: referralCode });
  const token = signToken({ id: user.id, email: user.email, role: user.role });

  // Fire-and-forget welcome email
  sendWelcome(user.email, user.fullName ?? "there").catch((err) =>
    console.error("[auth] welcome email failed:", err),
  );

  return res.status(201).json(envelope({ user, token }));
});

r.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorEnvelope("validation", "Invalid input", parsed.error.flatten()));
  }

  const user = await users.findByEmail(parsed.data.email);
  if (!user?.passwordHash) {
    return res.status(401).json(errorEnvelope("unauthorized", "Invalid email or password"));
  }

  const valid = await users.verifyPassword(user.passwordHash, parsed.data.password);
  if (!valid) {
    return res.status(401).json(errorEnvelope("unauthorized", "Invalid email or password"));
  }

  if (!user.isActive) {
    return res.status(403).json(errorEnvelope("forbidden", "Account is suspended"));
  }

  const { passwordHash: _, ...safeUser } = user;
  const token = signToken({ id: safeUser.id, email: safeUser.email, role: safeUser.role });
  return res.json(envelope({ user: safeUser, token }));
});

r.post("/forgot-password", async (req, res) => {
  const email = String(req.body?.email ?? "").toLowerCase().trim();
  if (!email) {
    return res.status(400).json(errorEnvelope("validation", "Email required"));
  }

  // Always return 200 to avoid email enumeration
  const user = await users.findByEmail(email);
  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await users.storeResetToken(user.id, tokenHash, expiresAt);
    const resetUrl = `${process.env.WEB_BASE_URL}/reset-password?token=${rawToken}`;

    sendPasswordReset(user.email, resetUrl).catch((err) =>
      console.error("[auth] reset email failed:", err),
    );
  }

  return res.json(envelope({ message: "If that email exists, a reset link has been sent." }));
});

r.post("/reset-password", async (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token || !password || String(password).length < 8) {
    return res.status(400).json(errorEnvelope("validation", "Token and password (min 8 chars) required"));
  }

  const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");
  const userId = await users.consumeResetToken(tokenHash);
  if (!userId) {
    return res.status(400).json(errorEnvelope("invalid_token", "Token is invalid or has expired"));
  }

  await users.updatePassword(userId, String(password));
  return res.json(envelope({ message: "Password updated successfully" }));
});

r.get("/me", requireAuth, async (req, res) => {
  const user = await users.findById(req.user!.id);
  if (!user) return res.status(404).json(errorEnvelope("not_found", "User not found"));
  return res.json(envelope(user));
});

export default r;
