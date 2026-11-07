import "server-only";
import { timingSafeEqual } from "crypto";

/**
 * Prototype access control for staff operations.
 *
 * - If SEEDFLOW_ADMIN_KEY is set, every write (and every read of requester
 *   contact details) must send it in the `x-seedflow-key` header. Staff enter
 *   it once on the Settings page.
 * - If no key is set, writes are allowed only outside production
 *   (`next dev`, or SEEDFLOW_ALLOW_UNAUTHENTICATED_WRITES=true for a local
 *   `next start`). A public deployment without a key is read-only and shows
 *   no contact details.
 *
 * This is a shared-secret gate for a hackathon prototype, not a full user
 * login system. Replace it with Supabase Auth before handling real data.
 */
function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function authMode(): "key" | "open-dev" | "read-only" {
  if (process.env.SEEDFLOW_ADMIN_KEY) return "key";
  if (process.env.NODE_ENV !== "production" || process.env.SEEDFLOW_ALLOW_UNAUTHENTICATED_WRITES === "true")
    return "open-dev";
  return "read-only";
}

export function isStaff(req: Request): boolean {
  const mode = authMode();
  if (mode === "open-dev") return true;
  if (mode === "read-only") return false;
  const sent = req.headers.get("x-seedflow-key") ?? "";
  return safeEqual(sent, process.env.SEEDFLOW_ADMIN_KEY!);
}
