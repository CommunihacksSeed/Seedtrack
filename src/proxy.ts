/**
 * Sign-in gate. Runs on the server before every page and API request.
 *
 * Everything needs a signed-in account except the public request form, the
 * sign-in and sign-up pages, and the endpoints those use. Pages redirect to
 * /login; APIs answer 401 with no data.
 */
import { NextResponse, type NextRequest } from "next/server";
import { env } from "cloudflare:workers";
import { readSessionCookie, sessionAccount } from "@/lib/server/accounts";

const PUBLIC_PAGES = [/^\/request\/?$/, /^\/request\//, /^\/login\/?$/, /^\/signup\/?$/];
const PUBLIC_APIS = [
  /^\/api\/public\//,
  /^\/api\/auth\/(signup|signin|signout|me)\/?$/,
  /^\/api\/integrations\/cognito\/webhook\/?$/,
  /^\/api\/version\/?$/,
];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  if ((isApi ? PUBLIC_APIS : PUBLIC_PAGES).some((r) => r.test(pathname))) return NextResponse.next();

  if (await sessionAccount(env.DB, readSessionCookie(request))) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: "Please sign in.", code: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Skip build assets and files with an extension (icons, CSV templates).
  matcher: ["/((?!_next/|assets/|@|favicon|.*\\.[a-zA-Z0-9]+$).*)"],
};
