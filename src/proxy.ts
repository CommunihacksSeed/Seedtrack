/**
 * Staff gate. Runs on the server before every page and API request.
 *
 * Locked by default: anything not on the public list below needs a valid staff
 * session. Pages redirect to /login; APIs answer 401 with no data. This is what
 * keeps requester emails and mailing addresses visible to YFS staff only.
 *
 * Public:
 *   /request                 the seed request form for schools and groups
 *   /login                   staff sign-in
 *   /api/public/*            the form's seed list and submissions (no contacts)
 *   /api/auth/{login,logout,status,setup}
 *   /api/integrations/cognito/webhook   (has its own secret)
 *   /api/version             deploy/data version numbers only
 */
import { NextResponse, type NextRequest } from "next/server";
import { env } from "cloudflare:workers";
import { readCookie, sessionUser } from "@/lib/server/staff-auth";

const PUBLIC_PAGES = [/^\/request\/?$/, /^\/request\//, /^\/login\/?$/];
const PUBLIC_APIS = [
  /^\/api\/public\//,
  /^\/api\/auth\/(login|logout|status|setup)\/?$/,
  /^\/api\/integrations\/cognito\/webhook\/?$/,
  /^\/api\/version\/?$/,
];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  if ((isApi ? PUBLIC_APIS : PUBLIC_PAGES).some((r) => r.test(pathname))) return NextResponse.next();

  const user = await sessionUser(env.DB, readCookie(request));
  if (user) return NextResponse.next();

  if (isApi) {
    return NextResponse.json({ error: "Please sign in as staff.", code: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Skip build assets and files with an extension (icons, CSV templates).
  matcher: ["/((?!_next/|assets/|@|favicon|.*\\.[a-zA-Z0-9]+$).*)"],
};
