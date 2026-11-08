import { connection } from "next/server";
import { z } from "zod";
import { authDb, staffOnly } from "@/lib/server/auth-guard";
import { AuthError, addUser, listUsers } from "@/lib/server/staff-auth";

export async function GET(req: Request) {
  await connection();
  return staffOnly(req, async (me) => ({ me: me.id, users: await listUsers(authDb()) }));
}

const schema = z.object({ email: z.string().max(200), name: z.string().max(100).optional(), password: z.string().max(200) });

/** Signed-in staff add a colleague with a starting password (they can change it after signing in). */
export async function POST(req: Request) {
  return staffOnly(req, async () => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AuthError("Enter an email and a starting password.");
    return { user: await addUser(authDb(), parsed.data.email, parsed.data.name ?? null, parsed.data.password) };
  });
}
