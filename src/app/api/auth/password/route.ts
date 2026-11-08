import { z } from "zod";
import { authDb, staffOnly } from "@/lib/server/auth-guard";
import { AuthError, changePassword } from "@/lib/server/staff-auth";

const schema = z.object({ current: z.string().max(200), next: z.string().max(200) });

/** Change your own password. Signs out your other sessions. */
export async function POST(req: Request) {
  return staffOnly(req, async (user) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AuthError("Enter your current and new password.");
    await changePassword(authDb(), user.id, parsed.data.current, parsed.data.next, user.tokenHash);
    return { ok: true };
  });
}
