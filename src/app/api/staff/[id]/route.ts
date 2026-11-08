import { authDb, staffOnly } from "@/lib/server/auth-guard";
import { removeUser } from "@/lib/server/staff-auth";

export async function DELETE(req: Request, ctx: RouteContext<"/api/staff/[id]">) {
  const { id } = await ctx.params;
  return staffOnly(req, async (me) => {
    await removeUser(authDb(), id, me.id);
    return { ok: true };
  });
}
