import { z } from "zod";
import { getStore } from "@/lib/store";
import { DomainError } from "@/lib/domain";
import { parseBody, staffWrite } from "@/lib/server/http";
import { orderInputSchema } from "@/lib/schemas";
import { notifyLater } from "@/lib/server/notify";

const bodySchema = z.object({ orders: z.array(z.unknown()).max(1000) });

/**
 * Import already-mapped requests (the client maps CSV/JSON columns and shows a
 * preview first). Every record is re-validated here. Duplicate Cognito entry
 * IDs are reported and not re-imported.
 */
export async function POST(req: Request) {
  return staffWrite(req, async () => {
    const { orders } = await parseBody(req, bodySchema);
    const store = getStore();
    const results: { row: number; status: "imported" | "duplicate" | "error"; message: string; order_number?: number }[] = [];
    for (let i = 0; i < orders.length; i++) {
      const parsed = orderInputSchema.safeParse(orders[i]);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        results.push({ row: i + 1, status: "error", message: `${issue.path.join(".")}: ${issue.message}` });
        continue;
      }
      try {
        const { order, duplicate } = await store.createOrder({ ...parsed.data, source: parsed.data.source ?? "csv" });
        if (!duplicate) notifyLater(store, "request_received", { orderId: order.id });
        results.push({
          row: i + 1,
          status: duplicate ? "duplicate" : "imported",
          message: duplicate
            ? `Entry ${order.external_entry_id} already imported as #${order.order_number}`
            : `${order.organization_name}`,
          order_number: order.order_number,
        });
      } catch (e) {
        results.push({ row: i + 1, status: "error", message: e instanceof DomainError ? e.message : "Server error" });
      }
    }
    return { results };
  });
}
