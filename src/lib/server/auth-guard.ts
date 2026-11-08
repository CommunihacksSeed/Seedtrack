import "server-only";
import { env } from "cloudflare:workers";
import { json } from "./http";
import { AuthError, ensureBootstrapAdmin, readCookie, sessionUser } from "./staff-auth";

export const authDb = () => env.DB;

export function adminSecrets() {
  return {
    email: env.SEEDFLOW_ADMIN_EMAIL ?? process.env.SEEDFLOW_ADMIN_EMAIL,
    password: env.SEEDFLOW_ADMIN_PASSWORD ?? process.env.SEEDFLOW_ADMIN_PASSWORD,
  };
}

/** SHA-256 (hex) of the one-time setup code, if one is configured. */
export function setupCodeHash(): string | null {
  const h = (env.SEEDFLOW_SETUP_CODE_SHA256 ?? process.env.SEEDFLOW_SETUP_CODE_SHA256 ?? "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(h) ? h : null;
}

/** Codes are typed by people: ignore case, spaces and missing dashes. */
export function normalizeSetupCode(code: string) {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 24 ? c.match(/.{6}/g)!.join("-") : c;
}

export async function setupCodeMatches(code: string) {
  const want = setupCodeHash();
  if (!want) return false;
  const got = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizeSetupCode(code))));
  const hex = [...got].map((b) => b.toString(16).padStart(2, "0")).join("");
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= hex.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

export async function bootstrapIfNeeded() {
  const { email, password } = adminSecrets();
  await ensureBootstrapAdmin(authDb(), email, password);
}

/** The signed-in staff member, or null. */
export async function currentStaff(req: Request) {
  return sessionUser(authDb(), readCookie(req));
}

/** Run fn for signed-in staff only; otherwise 401. AuthErrors become readable JSON errors. */
export async function staffOnly(req: Request, fn: (user: NonNullable<Awaited<ReturnType<typeof currentStaff>>>) => Promise<unknown>) {
  const user = await currentStaff(req);
  if (!user) return json({ error: "Please sign in as staff.", code: "unauthorized" }, 401);
  try {
    return json((await fn(user)) ?? { ok: true });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Something went wrong on the server." }, 500);
  }
}

// Brute-force brake for sign-in: per IP and per email, 10 tries per 15 minutes (per worker, best effort).
const WINDOW = 15 * 60_000;
const LIMIT = 10;
const attempts = new Map<string, number[]>();
export function tooManyAttempts(keys: string[]) {
  const now = Date.now();
  let blocked = false;
  for (const k of keys) {
    const recent = (attempts.get(k) ?? []).filter((t) => now - t < WINDOW);
    if (recent.length >= LIMIT) blocked = true;
    recent.push(now);
    attempts.set(k, recent);
  }
  if (attempts.size > 10_000) attempts.clear();
  return blocked;
}
export function clientIp(req: Request) {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
