/**
 * Email + password accounts: sign up, sign in, sign out.
 *
 * - Passwords: at least 8 characters with at least one letter and one digit,
 *   stored as salted PBKDF2-SHA256 (100,000 iterations).
 * - Sessions: a random 256-bit token in an HttpOnly, Secure, SameSite=Lax
 *   cookie, valid 7 days. Only the token's SHA-256 is stored.
 */
import type { D1Database } from "@cloudflare/workers-types";

export const SESSION_COOKIE = "__Host-seedflow_session";
const SESSION_DAYS = 7;
const ITERATIONS = 100_000;

export type Account = { id: string; email: string; created_at: string };

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256Hex = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Returns why an email can't be used, or null if it's fine. */
export function emailProblem(email: string): string | null {
  const e = normalizeEmail(email);
  if (!e) return "Enter your email.";
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Enter a valid email address.";
  return null;
}

/** Returns why a password is too weak, or null if it meets the rules. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 200) return "Password must be 200 characters or fewer.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Password must include at least one letter and one number.";
  return null;
}

async function derive(password: string, salt: BufferSource) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || Number(iterations) !== ITERATIONS || !salt || !hash) return false;
  const got = await derive(password, unb64(salt));
  const want = unb64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

// Compared against when the email has no account, so both cases take about as long.
const DUMMY_HASH = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export async function signUp(db: D1Database, email: string, password: string): Promise<Account> {
  const problem = emailProblem(email) ?? passwordProblem(password);
  if (problem) throw new AuthError(problem);
  const account: Account = { id: crypto.randomUUID(), email: normalizeEmail(email), created_at: new Date().toISOString() };
  try {
    await db
      .prepare("INSERT INTO accounts (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(account.id, account.email, await hashPassword(password), account.created_at)
      .run();
  } catch (e) {
    if (e instanceof Error && /UNIQUE/i.test(e.message)) throw new AuthError("An account with this email already exists. Sign in instead.", 409);
    throw e;
  }
  return account;
}

/** The account for these credentials, or null. Wrong email and wrong password look the same. */
export async function signIn(db: D1Database, email: string, password: string): Promise<Account | null> {
  const row = await db
    .prepare("SELECT id, email, created_at, password_hash FROM accounts WHERE lower(email) = ?")
    .bind(normalizeEmail(email))
    .first<Account & { password_hash: string }>();
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) return null;
  return { id: row.id, email: row.email, created_at: row.created_at };
}

export async function createSession(db: D1Database, accountId: string) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.batch([
    db.prepare("DELETE FROM account_sessions WHERE expires_at < ?").bind(now.toISOString()),
    db.prepare("INSERT INTO account_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)").bind(await sha256Hex(token), accountId, expires.toISOString()),
  ]);
  return { token, expires };
}

export async function sessionAccount(db: D1Database, token: string | null | undefined): Promise<Account | null> {
  if (!token || token.length > 200) return null;
  return db
    .prepare(
      `SELECT a.id, a.email, a.created_at FROM account_sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(await sha256Hex(token), new Date().toISOString())
    .first<Account>();
}

export async function deleteSession(db: D1Database, token: string | null | undefined) {
  if (!token) return;
  await db.prepare("DELETE FROM account_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
}

export function readSessionCookie(req: Request) {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

export const sessionCookie = (token: string, expires: Date) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires.toUTCString()}`;

export const clearedSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
