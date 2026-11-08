import { z } from "zod";
import { json } from "@/lib/server/http";
import { adminSecrets, authDb } from "@/lib/server/auth-guard";
import { AuthError, addUser, countUsers, createSession, isLocalRequest, sessionCookie } from "@/lib/server/staff-auth";

const schema = z.object({ email: z.string().max(200), name: z.string().max(100).optional(), password: z.string().max(200) });

/** One-time: create the first staff account on a local dev server. Refused everywhere else. */
export async function POST(req: Request) {
  const db = authDb();
  const { email, password } = adminSecrets();
  if (!isLocalRequest(req) || (email && password) || (await countUsers(db)) > 0)
    return json({ error: "Setup isn’t available. Ask an existing staff member to add you." }, 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Enter an email and password." }, 400);
  try {
    const user = await addUser(db, parsed.data.email, parsed.data.name ?? null, parsed.data.password);
    const { token, expires } = await createSession(db, user.id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", "set-cookie": sessionCookie(token, expires) },
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    throw e;
  }
}
