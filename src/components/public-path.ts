/** Pages anyone can open without seeing staff screens or staff data. */
export function isPublicPath(path: string | null) {
  return path === "/request" || (path?.startsWith("/request/") ?? false);
}

/** Sign-in and sign-up: shown without the staff sidebar and without loading staff data. */
export function isAuthPath(path: string | null) {
  return path === "/login" || path === "/signup";
}
