import { getStore } from "@/lib/store";
import { parseBody, staffWrite } from "@/lib/server/http";
import { orderInputSchema } from "@/lib/schemas";
import { notifyLater } from "@/lib/server/notify";

/** Manual request entry. */
export async function POST(req: Request) {
  return staffWrite(req, async () => {
    const input = await parseBody(req, orderInputSchema);
    const store = getStore();
    const res = await store.createOrder({ ...input, source: input.source ?? "manual" });
    if (!res.duplicate) notifyLater(store, "request_received", { orderId: res.order.id });
    return res;
  });
}
