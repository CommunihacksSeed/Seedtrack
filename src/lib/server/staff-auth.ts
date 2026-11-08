/**
 * Staff sign-in: email + password accounts stored in D1.
 *
 * - Passwords: salted PBKDF2-SHA256 (100,000 iterations, the Workers maximum),
 *   compared in constant time. Never stored or logged in plain text.
 * - Sessions: a random 256-bit token in an HttpOnly, Secure, SameSite=Lax
 *   cookie. Only the token's SHA-256 hash is stored, with a 12-hour expiry.
 * - First account: created from the SEEDFLOW_ADMIN_EMAIL / SEEDFLOW_ADMIN_PASSWORD
 *   secrets the first time someone signs in with them. On a local dev server
 *   (localhost) with no accounts, the sign-in page offers a one-time setup form.
 * - Everyone else is added by signed-in staff under Settings → Staff accounts.
 */
import type { D1Database } from "@cloudflare/workers-types";

export const SESSION_COOKIE = "__Host-seedflow_session";
const SESSION_HOURS = 12;
const ITERATIONS = 100_000;
export const MIN_PASSWORD = 10;

export interface StaffUser {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  last_login_at: string | null;
}

export class AuthError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  return timingSafeEqual(await pbkdf2(password, unb64(salt), Number(iter)), unb64(hash));
}

// Hash checked when the email doesn't exist, so a wrong email takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password-placeholder"));

async function sha256Hex(s: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

export function checkPasswordStrength(password: string) {
  if (password.length < MIN_PASSWORD) throw new AuthError(`Use at least ${MIN_PASSWORD} characters for the password.`);
  if (password.length > 200) throw new AuthError("That password is too long.");
}

export async function countUsers(db: D1Database) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM staff_users").first<{ n: number }>();
  return r?.n ?? 0;
}

export async function listUsers(db: D1Database): Promise<StaffUser[]> {
  const r = await db.prepare("SELECT id, email, name, created_at, last_login_at FROM staff_users ORDER BY email").all<StaffUser>();
  return r.results ?? [];
}

export async function addUser(db: D1Database, email: string, name: string | null, password: string): Promise<StaffUser> {
  const e = normalizeEmail(email);
  if (!isValidEmail(e)) throw new AuthError("Enter a valid email address.");
  checkPasswordStrength(password);
  const exists = await db.prepare("SELECT 1 FROM staff_users WHERE email = ?").bind(e).first();
  if (exists) throw new AuthError("A staff account with that email already exists.", 409);
  const user: StaffUser = { id: crypto.randomUUID(), email: e, name: name?.trim() || null, created_at: new Date().toISOString(), last_login_at: null };
  await db
    .prepare("INSERT INTO staff_users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(user.id, user.email, user.name, await hashPassword(password), user.created_at)
    .run();
  return user;
}

export async function removeUser(db: D1Database, id: string, currentUserId: string) {
  if (id === currentUserId) throw new AuthError("You can’t remove your own account while signed in.");
  if ((await countUsers(db)) <= 1) throw new AuthError("At least one staff account must remain.");
  const r = await db.prepare("DELETE FROM staff_users WHERE id = ?").bind(id).run();
  if (!r.meta.changes) throw new AuthError("That staff account no longer exists.", 404);
  await db.prepare("DELETE FROM staff_sessions WHERE user_id = ?").bind(id).run();
}

export async function changePassword(db: D1Database, userId: string, current: string, next: string, keepTokenHash: string | null) {
  const row = await db.prepare("SELECT password_hash FROM staff_users WHERE id = ?").bind(userId).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(current, row.password_hash))) throw new AuthError("Your current password isn’t right.", 403);
  checkPasswordStrength(next);
  await db.prepare("UPDATE staff_users SET password_hash = ? WHERE id = ?").bind(await hashPassword(next), userId).run();
  // Sign out every other session for this account.
  await db.prepare("DELETE FROM staff_sessions WHERE user_id = ? AND token_hash <> ?").bind(userId, keepTokenHash ?? "").run();
}

/** Creates the first admin from secrets if there are no accounts yet. */
export async function ensureBootstrapAdmin(db: D1Database, adminEmail?: string, adminPassword?: string) {
  if (!adminEmail || !adminPassword) return;
  if ((await countUsers(db)) > 0) return;
  try {
    await addUser(db, adminEmail, "Admin", adminPassword);
  } catch (e) {
    if (!(e instanceof AuthError && e.status === 409)) throw e;
  }
}

/** Checks an email + password. Returns the user or null (same timing either way). */
export async function authenticate(db: D1Database, email: string, password: string) {
  const row = await db
    .prepare("SELECT id, email, name, created_at, last_login_at, password_hash FROM staff_users WHERE email = ?")
    .bind(normalizeEmail(email))
    .first<StaffUser & { password_hash: string }>();
  if (!row) {
    await verifyPassword(password, await getDummyHash());
    return null;
  }
  if (!(await verifyPassword(password, row.password_hash))) return null;
  const { password_hash: _ignored, ...user } = row;
  void _ignored;
  return user as StaffUser;
}

export async function createSession(db: D1Database, userId: string) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_HOURS * 3600_000);
  await db.batch([
    db.prepare("DELETE FROM staff_sessions WHERE expires_at < ?").bind(now.toISOString()),
    db
      .prepare("INSERT INTO staff_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256Hex(token), userId, now.toISOString(), expires.toISOString()),
    db.prepare("UPDATE staff_users SET last_login_at = ? WHERE id = ?").bind(now.toISOString(), userId),
  ]);
  return { token, expires };
}

export async function sessionUser(db: D1Database, token: string | null | undefined): Promise<(StaffUser & { tokenHash: string }) | null> {
  if (!token || token.length > 200) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.created_at, u.last_login_at FROM staff_sessions s
       JOIN staff_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<StaffUser>();
  return row ? { ...row, tokenHash } : null;
}

export async function deleteSession(db: D1Database, token: string | null | undefined) {
  if (!token) return;
  await db.prepare("DELETE FROM staff_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
}

export function readCookie(req: Request, name = SESSION_COOKIE) {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function sessionCookie(token: string, expires: Date) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires.toUTCString()}`;
}

export function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Local dev only: a page served from localhost may create the very first account. */
export function isLocalRequest(req: Request) {
  const host = new URL(req.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}
