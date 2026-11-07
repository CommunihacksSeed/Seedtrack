import { getStore } from "@/lib/store";
import { parseBody, handleWrite } from "@/lib/server/http";
import { bundleSchema } from "@/lib/schemas";

export async function PATCH(req: Request, ctx: RouteContext<"/api/bundles/[id]">) {
  const { id } = await ctx.params;
  return handleWrite(async () => getStore().saveBundle(id, await parseBody(req, bundleSchema)));
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/bundles/[id]">) {
  const { id } = await ctx.params;
  return handleWrite(async () => {
    await getStore().deleteBundle(id);
    return { ok: true };
  });
}
