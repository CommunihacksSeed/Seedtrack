import { authDb } from "@/lib/server/auth-guard";
import { clearedSessionCookie, deleteSession, readCookie } from "@/lib/server/staff-auth";

export async function POST(req: Request) {
  await deleteSession(authDb(), readCookie(req));
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": clearedSessionCookie() },
  });
}
