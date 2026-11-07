import { getStore } from "@/lib/store";
import { parseBody, staffWrite } from "@/lib/server/http";
import { bundleSchema } from "@/lib/schemas";

export async function PATCH(req: Request, ctx: RouteContext<"/api/bundles/[id]">) {
  const { id } = await ctx.params;
  return staffWrite(req, async () => getStore().saveBundle(id, await parseBody(req, bundleSchema)));
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/bundles/[id]">) {
  const { id } = await ctx.params;
  return staffWrite(req, async () => {
    await getStore().deleteBundle(id);
    return { ok: true };
  });
}
