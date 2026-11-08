/** Pages anyone can open without seeing staff screens or staff data. */
export function isPublicPath(path: string | null) {
  return path === "/request" || path === "/login" || (path?.startsWith("/request/") ?? false);
}
