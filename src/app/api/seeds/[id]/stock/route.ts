import { getStore } from "@/lib/store";
import { parseBody, handleWrite } from "@/lib/server/http";
import { stockCountSchema } from "@/lib/schemas";
import { withLowStockCheck } from "@/lib/server/notify";

export async function POST(req: Request, ctx: RouteContext<"/api/seeds/[id]/stock">) {
  const { id } = await ctx.params;
  return handleWrite(async () => {
    const body = await parseBody(req, stockCountSchema);
    const store = getStore();
    return withLowStockCheck(store, async () => [id], () => store.setStockCount(id, body.physical_quantity, body.notes ?? null));
  });
}
