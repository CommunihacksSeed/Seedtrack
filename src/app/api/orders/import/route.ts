import { z } from "zod";
import { getStore } from "@/lib/store";
import { createOrder, DomainError } from "@/lib/domain";
import { parseBody, staffWrite } from "@/lib/server/http";
import { orderInputSchema } from "@/lib/schemas";

type ImportResult = { row: number; status: "imported" | "duplicate" | "error"; message: string; order_number?: number };

const bodySchema = z.object({ orders: z.array(z.unknown()).max(1000) });

/**
 * Import already-mapped requests (the client maps CSV/JSON columns and shows a
 * preview first). Every record is re-validated here. Duplicate Cognito entry
 * IDs are reported and not re-imported.
 */
export async function POST(req: Request) {
  return staffWrite(req, async () => {
    const { orders } = await parseBody(req, bodySchema);
    const results = await getStore().transact((draft) => {
      const rows: ImportResult[] = [];
      for (let i = 0; i < orders.length; i++) {
        const parsed = orderInputSchema.safeParse(orders[i]);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          rows.push({ row: i + 1, status: "error", message: `${issue.path.join(".")}: ${issue.message}` });
          continue;
        }
        try {
          const { order, duplicate } = createOrder(draft, { ...parsed.data, source: parsed.data.source ?? "csv" });
          rows.push({
            row: i + 1,
            status: duplicate ? "duplicate" : "imported",
            message: duplicate
              ? `Entry ${order.external_entry_id} already imported as #${order.order_number}`
              : `${order.organization_name}`,
            order_number: order.order_number,
          });
        } catch (e) {
          rows.push({ row: i + 1, status: "error", message: e instanceof DomainError ? e.message : "Server error" });
        }
      }
      return rows;
    });
    return { results };
  });
}
