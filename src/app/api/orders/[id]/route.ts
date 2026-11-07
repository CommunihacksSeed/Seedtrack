import { getStore } from "@/lib/store";
import { parseBody, staffWrite } from "@/lib/server/http";
import { orderActionSchema } from "@/lib/schemas";

/** All order workflow transitions go through one validated action endpoint. */
export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  return staffWrite(req, async () => {
    const a = await parseBody(req, orderActionSchema);
    const s = getStore();
    switch (a.action) {
      case "start_review":
        return s.startReview(id);
      case "save_review":
        return s.saveReview(id, a.review);
      case "approve":
        return s.approveOrder(id, a.review);
      case "add_item":
        return s.addOrderItem(id, a.name);
      case "assign":
        return s.assignSteward(id, a.steward);
      case "start_preparing":
        return s.startPreparing(id);
      case "pack":
        return s.packItems(id, a.packs);
      case "ready":
        return s.markReady(id);
      case "deliver":
        return s.deliverOrder(id);
      case "cancel":
        return s.cancelOrder(id, a.reason ?? null);
    }
  });
}
