import { getStore } from "@/lib/store";
import { parseBody, staffWrite } from "@/lib/server/http";
import { stockCountSchema } from "@/lib/schemas";

export async function POST(req: Request, ctx: RouteContext<"/api/seeds/[id]/stock">) {
  const { id } = await ctx.params;
  return staffWrite(req, async () => {
    const body = await parseBody(req, stockCountSchema);
    return getStore().setStockCount(id, body.physical_quantity, body.notes ?? null);
  });
}
