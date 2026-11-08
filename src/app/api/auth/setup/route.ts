import { z } from "zod";
import { json } from "@/lib/server/http";
import { adminSecrets, authDb, clientIp, setupCodeHash, setupCodeMatches, tooManyAttempts } from "@/lib/server/auth-guard";
import { AuthError, addUser, countUsers, createSession, isLocalRequest, sessionCookie } from "@/lib/server/staff-auth";

const schema = z.object({
  email: z.string().max(200),
  name: z.string().max(100).optional(),
  password: z.string().max(200),
  setup_code: z.string().max(100).optional(),
});

/**
 * One-time: create the first staff account, only while no accounts exist.
 * On the live site this needs the setup code (its hash is in cloudflare.config.ts);
 * a local dev server with no admin secrets allows it without one.
 */
export async function POST(req: Request) {
  const db = authDb();
  const { email, password } = adminSecrets();
  const local = isLocalRequest(req) && !(email && password);
  const closed = () => json({ error: "Setup isn’t available. Ask an existing staff member to add you." }, 403);
  if ((!local && !setupCodeHash()) || (await countUsers(db)) > 0) return closed();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Enter an email and password." }, 400);
  if (!local) {
    const ip = clientIp(req);
    if (tooManyAttempts(["setup", ...(ip ? [`setup:${ip}`] : [])]))
      return json({ error: "Too many attempts. Please wait 15 minutes and try again." }, 429);
    if (!(await setupCodeMatches(parsed.data.setup_code ?? ""))) return json({ error: "That setup code isn’t right." }, 403);
  }
  try {
    const user = await addUser(db, parsed.data.email, parsed.data.name ?? null, parsed.data.password);
    // Two people racing with the code: only the first account counts.
    if ((await countUsers(db)) > 1) {
      await db.prepare("DELETE FROM staff_users WHERE id = ?").bind(user.id).run();
      return closed();
    }
    const { token, expires } = await createSession(db, user.id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": sessionCookie(token, expires) },
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    throw e;
  }
}
