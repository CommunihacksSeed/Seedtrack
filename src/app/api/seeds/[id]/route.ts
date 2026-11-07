import { getStore } from "@/lib/store";
import { parseBody, staffWrite } from "@/lib/server/http";
import { seedUpdateSchema } from "@/lib/schemas";

export async function PATCH(req: Request, ctx: RouteContext<"/api/seeds/[id]">) {
  const { id } = await ctx.params;
  return staffWrite(req, async () => getStore().updateSeed(id, await parseBody(req, seedUpdateSchema)));
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/seeds/[id]">) {
  const { id } = await ctx.params;
  return staffWrite(req, async () => {
    await getStore().deleteSeed(id);
    return { ok: true };
  });
}
