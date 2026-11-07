import { connection } from "next/server";
import { getStore } from "@/lib/store";
import { errorResponse, json } from "@/lib/server/http";
import { toCsv } from "@/lib/csv";
import { availableQuantity, seedLabel, stockStatus } from "@/lib/domain";
import { distributionRows, seedMap } from "@/lib/views";
import { MOVEMENT_LABELS } from "@/lib/types";

/** CSV exports. */
export async function GET(_req: Request, ctx: RouteContext<"/api/export/[kind]">) {
  await connection();
  const { kind } = await ctx.params;
  try {
    const db = await getStore().snapshot();
    let csv: string;
    switch (kind) {
      case "inventory":
        csv = toCsv(
          ["name", "variety", "category", "physical_quantity", "reserved_quantity", "available_quantity", "status", "unit", "storage_location", "low_stock_threshold", "description", "updated_at"],
          db.seeds.map((s) => [s.name, s.variety, s.category, s.physical_quantity, s.reserved_quantity, availableQuantity(s), stockStatus(s), s.unit, s.storage_location, s.low_stock_threshold, s.description, s.updated_at]),
        );
        break;
      case "orders": {
        const seeds = seedMap(db);
        csv = toCsv(
          ["order_number", "external_entry_id", "status", "organization_name", "requester_name", "requester_email", "mailing_address", "school_use", "student_count", "bundles", "items", "special_requests", "source", "submitted_at", "approved_at", "delivered_at"],
          db.orders.map((o) => [
            o.order_number, o.external_entry_id, o.status, o.organization_name, o.requester_name,
            o.requester_email, o.mailing_address,
            o.school_use, o.student_count, o.requested_bundles,
            db.order_items.filter((i) => i.order_id === o.id).map((i) => {
              const s = i.seed_id ? seeds.get(i.seed_id) : null;
              return `${s ? seedLabel(s) : i.requested_seed_name} (requested ${i.requested_quantity ?? "unspecified"}, approved ${i.unavailable ? "unavailable" : i.approved_quantity ?? "pending"})`;
            }),
            o.special_requests, o.source, o.submitted_at, o.approved_at, o.delivered_at,
          ]),
        );
        break;
      }
      case "distribution":
        csv = toCsv(
          ["delivered_at", "order_number", "organization_name", "seed", "category", "quantity"],
          distributionRows(db).map((r) => [r.delivered_at, r.order.order_number, r.order.organization_name, r.seedLabel, r.category, r.quantity]),
        );
        break;
      case "movements": {
        const seeds = seedMap(db);
        const orders = new Map(db.orders.map((o) => [o.id, o]));
        csv = toCsv(
          ["created_at", "seed", "movement", "quantity", "physical_after", "reserved_after", "order_number", "notes"],
          db.inventory_movements.map((m) => {
            const s = seeds.get(m.seed_id);
            return [m.created_at, s ? seedLabel(s) : m.seed_id, MOVEMENT_LABELS[m.movement_type], m.quantity, m.physical_after, m.reserved_after, m.order_id ? orders.get(m.order_id)?.order_number : null, m.notes];
          }),
        );
        break;
      }
      default:
        return json({ error: "Unknown export" }, 404);
    }
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="seedflow-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
