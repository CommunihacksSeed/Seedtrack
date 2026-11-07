import { getStore } from "@/lib/store";
import { parseBody, handleWrite } from "@/lib/server/http";
import { orderActionSchema } from "@/lib/schemas";
import { notifyLater, withLowStockCheck } from "@/lib/server/notify";

/** All order workflow transitions go through one validated action endpoint. */
export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  return handleWrite(async () => {
    const a = await parseBody(req, orderActionSchema);
    const s = getStore();
    // Seeds touched by this order (for low-stock alerts after reserving / delivering).
    const seedIds = async () => (await s.snapshot()).order_items.filter((i) => i.order_id === id && i.seed_id).map((i) => i.seed_id!);
    switch (a.action) {
      case "start_review":
        return s.startReview(id);
      case "save_review":
        return s.saveReview(id, a.review);
      case "approve": {
        const o = await withLowStockCheck(s, seedIds, () => s.approveOrder(id, a.review));
        notifyLater(s, "order_approved", { orderId: id });
        return o;
      }
      case "add_item":
        return s.addOrderItem(id, a.name);
      case "add_bundle":
        return { added: await s.addBundleItems(id, a.bundle_id) };
      case "assign":
        return s.assignSteward(id, a.steward);
      case "set_delivery":
        return s.setDelivery(id, { delivery_method: a.delivery_method, delivery_lat: a.delivery_lat, delivery_lng: a.delivery_lng });
      case "start_preparing":
        return s.startPreparing(id);
      case "pack":
        return s.packItems(id, a.packs);
      case "ready": {
        const before = (await s.snapshot()).orders.find((o) => o.id === id)?.status;
        const o = await s.markReady(id);
        if (before !== "Ready") notifyLater(s, "order_ready", { orderId: id });
        return o;
      }
      case "deliver": {
        const o = await withLowStockCheck(s, seedIds, () => s.deliverOrder(id));
        notifyLater(s, "order_delivered", { orderId: id });
        return o;
      }
      case "cancel":
        return s.cancelOrder(id, a.reason ?? null);
    }
  });
}
