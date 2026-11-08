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
