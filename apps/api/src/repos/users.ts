import { db } from "../db.js";
import bcrypt from "bcryptjs";

export interface User {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: "customer" | "admin";
  avatarUrl: string | null;
  referralCode: string;
  referredBy: string | null;
  marketingConsent: boolean;
  isActive: boolean;
  createdAt: string;
}

function mapRow(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    fullName: row.full_name as string | null,
    phone: row.phone as string | null,
    role: row.role as "customer" | "admin",
    avatarUrl: row.avatar_url as string | null,
    referralCode: row.referral_code as string,
    referredBy: row.referred_by as string | null,
    marketingConsent: row.marketing_consent as boolean,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
  };
}

export async function findById(id: string): Promise<User | null> {
  const { rows } = await db.query(
    `SELECT id, email, full_name, phone, role, avatar_url, referral_code,
            referred_by, marketing_consent, is_active, created_at
     FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findByEmail(email: string): Promise<(User & { passwordHash: string | null }) | null> {
  const { rows } = await db.query(
    `SELECT id, email, full_name, phone, role, avatar_url, referral_code,
            referred_by, marketing_consent, is_active, created_at, password_hash
     FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  if (!rows[0]) return null;
  return { ...mapRow(rows[0]), passwordHash: rows[0].password_hash as string | null };
}

export async function create(data: {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  referredByCode?: string;
  marketingConsent?: boolean;
}): Promise<User> {
  const passwordHash = await bcrypt.hash(data.password, 12);

  // Resolve referral code to user ID
  let referredById: string | null = null;
  if (data.referredByCode) {
    const { rows } = await db.query(
      `SELECT id FROM users WHERE upper(referral_code) = upper($1)`,
      [data.referredByCode],
    );
    referredById = rows[0]?.id ?? null;
  }

  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, phone, referred_by, marketing_consent)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, full_name, phone, role, avatar_url, referral_code,
               referred_by, marketing_consent, is_active, created_at`,
    [
      data.email.toLowerCase(),
      passwordHash,
      data.fullName ?? null,
      data.phone ?? null,
      referredById,
      data.marketingConsent ?? false,
    ],
  );

  // Record referral
  if (referredById) {
    await db.query(
      `INSERT INTO referrals (referrer_id, referee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [referredById, rows[0].id],
    );
  }

  return mapRow(rows[0]);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function updateProfile(
  id: string,
  data: { fullName?: string; phone?: string; marketingConsent?: boolean; avatarUrl?: string },
): Promise<User | null> {
  const { rows } = await db.query(
    `UPDATE users
     SET full_name         = COALESCE($2, full_name),
         phone             = COALESCE($3, phone),
         marketing_consent = COALESCE($4, marketing_consent),
         avatar_url        = COALESCE($5, avatar_url),
         updated_at        = now()
     WHERE id = $1
     RETURNING id, email, full_name, phone, role, avatar_url, referral_code,
               referred_by, marketing_consent, is_active, created_at`,
    [id, data.fullName ?? null, data.phone ?? null, data.marketingConsent ?? null, data.avatarUrl ?? null],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function storeResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await db.query(
    `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)
     ON CONFLICT (token_hash) DO NOTHING`,
    [tokenHash, userId, expiresAt.toISOString()],
  );
}

export async function consumeResetToken(tokenHash: string): Promise<string | null> {
  const { rows } = await db.query(
    `UPDATE password_reset_tokens
     SET used_at = now()
     WHERE token_hash = $1
       AND used_at IS NULL
       AND expires_at > now()
     RETURNING user_id`,
    [tokenHash],
  );
  return rows[0]?.user_id ?? null;
}

export async function updatePassword(userId: string, newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 12);
  // password_changed_at invalidates every token issued before this moment.
  await db.query(
    `UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1`,
    [userId, hash],
  );
}

/**
 * Auth gate data, cached 60s per user: tokens minted before the last password
 * change (or for deactivated accounts) are rejected without a per-request
 * bcrypt or full-profile load.
 */
const authGateCache = new Map<string, { isActive: boolean; passwordChangedAt: number | null; expires: number }>();

export async function getAuthGate(userId: string): Promise<{ isActive: boolean; passwordChangedAt: number | null } | null> {
  const cached = authGateCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return { isActive: cached.isActive, passwordChangedAt: cached.passwordChangedAt };
  }
  const { rows } = await db.query(
    `SELECT is_active, password_changed_at FROM users WHERE id = $1`,
    [userId],
  );
  if (!rows[0]) return null;
  const gate = {
    isActive: rows[0].is_active as boolean,
    passwordChangedAt: rows[0].password_changed_at
      ? new Date(rows[0].password_changed_at as string).getTime()
      : null,
  };
  authGateCache.set(userId, { ...gate, expires: Date.now() + 60_000 });
  return gate;
}
