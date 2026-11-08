/** Pages anyone can open without seeing staff screens or staff data. */
export function isPublicPath(path: string | null) {
  return path === "/request" || (path?.startsWith("/request/") ?? false);
}
