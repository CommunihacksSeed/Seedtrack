import { connection } from "next/server";
import { getStore } from "@/lib/store";
import { errorResponse, json } from "@/lib/server/http";

/**
 * What the public request form needs, and nothing else: seed names,
 * categories and stock (for "only N available"), plus bundle names and
 * contents. No requests, people or contact details.
 */
export async function GET() {
  await connection();
  try {
    const db = await getStore().snapshot();
    return json({
      seeds: db.seeds.map((s) => ({
        id: s.id,
        name: s.name,
        variety: s.variety,
        category: s.category,
        physical_quantity: s.physical_quantity,
        reserved_quantity: s.reserved_quantity,
      })),
      bundles: db.bundles.map((b) => ({ id: b.id, name: b.name, description: b.description, items: b.items.map((i) => ({ seed_id: i.seed_id })) })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
