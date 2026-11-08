import { z } from "zod";
import { json } from "@/lib/server/http";
import { authDb, bootstrapIfNeeded, clientIp, tooManyAttempts } from "@/lib/server/auth-guard";
import { authenticate, createSession, normalizeEmail, sessionCookie } from "@/lib/server/staff-auth";

const schema = z.object({ email: z.string().max(200), password: z.string().max(200) });

/** Only same-site paths, never "//host" or a full URL. */
function safeNext(v: unknown): string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/";
}

/**
 * Staff sign-in with email + password. The same message for any wrong combination.
 * Accepts JSON (the sign-in page) or a plain form post (if the page's script hasn't loaded yet),
 * which is answered with a redirect instead of JSON.
 */
export async function POST(req: Request) {
  const isForm = (req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded");
  let body: unknown = null;
  let next = "/";
  if (isForm) {
    const f = await req.formData().catch(() => null);
    if (f) {
      body = { email: String(f.get("email") ?? ""), password: String(f.get("password") ?? "") };
      next = safeNext(f.get("next"));
    }
  } else {
    body = await req.json().catch(() => null);
  }
  const fail = (error: string, status: number, code: string) =>
    isForm
      ? new Response(null, { status: 303, headers: { location: `/login?error=${code}&next=${encodeURIComponent(next)}`, "cache-control": "no-store" } })
      : json({ error }, status);

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Enter your email and password.", 400, "missing");
  const email = normalizeEmail(parsed.data.email);
  const ip = clientIp(req);
  if (tooManyAttempts([`email:${email}`, ...(ip ? [`ip:${ip}`] : [])]))
    return fail("Too many sign-in attempts. Please wait 15 minutes and try again.", 429, "locked");
  await bootstrapIfNeeded();
  const db = authDb();
  const user = await authenticate(db, email, parsed.data.password);
  if (!user) return fail("That email and password don’t match a staff account.", 401, "invalid");
  const { token, expires } = await createSession(db, user.id);
  const cookie = sessionCookie(token, expires);
  if (isForm) return new Response(null, { status: 303, headers: { location: next, "set-cookie": cookie, "cache-control": "no-store" } });
  return new Response(JSON.stringify({ ok: true, user: { email: user.email, name: user.name } }), {
    headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": cookie },
  });
}
