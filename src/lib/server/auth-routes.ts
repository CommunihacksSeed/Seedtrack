import "server-only";
import { env } from "cloudflare:workers";
import { AuthError, clearedSessionCookie, createSession, deleteSession, readSessionCookie, sessionAccount, sessionCookie, signIn, signUp } from "./accounts";

const db = () => env.DB;
const reply = (body: unknown, status = 200, cookie?: string) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...(cookie ? { "set-cookie": cookie } : {}) } });

async function credentials(req: Request) {
  try {
    const body = (await req.json()) as { email?: unknown; password?: unknown };
    return { email: typeof body.email === "string" ? body.email : "", password: typeof body.password === "string" ? body.password : "" };
  } catch {
    return { email: "", password: "" };
  }
}

export async function handleSignUp(req: Request) {
  const { email, password } = await credentials(req);
  try {
    const account = await signUp(db(), email, password);
    const { token, expires } = await createSession(db(), account.id);
    return reply({ email: account.email }, 201, sessionCookie(token, expires));
  } catch (e) {
    if (e instanceof AuthError) return reply({ error: e.message }, e.status);
    console.error(e);
    return reply({ error: "Something went wrong. Please try again." }, 500);
  }
}

export async function handleSignIn(req: Request) {
  const { email, password } = await credentials(req);
  if (!email || !password) return reply({ error: "Enter your email and password." }, 400);
  const account = await signIn(db(), email, password);
  if (!account) return reply({ error: "That email and password don’t match an account." }, 401);
  const { token, expires } = await createSession(db(), account.id);
  return reply({ email: account.email }, 200, sessionCookie(token, expires));
}

export async function handleSignOut(req: Request) {
  await deleteSession(db(), readSessionCookie(req));
  return reply({ ok: true }, 200, clearedSessionCookie());
}

export async function handleMe(req: Request) {
  const account = await sessionAccount(db(), readSessionCookie(req));
  return reply({ email: account?.email ?? null });
}
