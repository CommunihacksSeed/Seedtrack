/** Derived, read-only views over a snapshot (dashboard, reports, exports). */
import { availableQuantity, seedLabel, stockStatus } from "./domain";
import type { DataSnapshot, Order, OrderStatus, Seed } from "./types";
import { ORDER_STATUSES } from "./types";

export function seedMap(db: DataSnapshot) {
  return new Map(db.seeds.map((s) => [s.id, s]));
}

/** One row per delivered allocation (seed × delivered order). */
export function distributionRows(db: DataSnapshot) {
  const seeds = seedMap(db);
  const delivered = new Map(db.orders.filter((o) => o.status === "Delivered").map((o) => [o.id, o]));
  return db.order_items
    .filter((i) => delivered.has(i.order_id) && (i.approved_quantity ?? 0) > 0 && i.seed_id)
    .map((i) => {
      const o = delivered.get(i.order_id)!;
      const s = seeds.get(i.seed_id!);
      return {
        order: o,
        seed: s ?? null,
        seedLabel: s ? seedLabel(s) : i.requested_seed_name,
        category: s?.category ?? "Other",
        quantity: i.approved_quantity!,
        delivered_at: o.delivered_at!,
      };
    });
}

export function ordersByStatus(orders: Order[]) {
  return ORDER_STATUSES.map((status) => ({ status, count: orders.filter((o) => o.status === status).length }));
}

export function sumBy<T>(rows: T[], key: (r: T) => string, val: (r: T) => number) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + val(r));
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** Requests per ISO week (Monday start) for the last `weeks` weeks. */
export function requestsOverTime(orders: Order[], weeks = 8) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7 * (weeks - 1));
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i * 7);
    return { week: d, label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), requests: 0 };
  });
  for (const o of orders) {
    const t = new Date(o.submitted_at).getTime();
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (t >= buckets[i].week.getTime()) {
        buckets[i].requests++;
        break;
      }
    }
  }
  return buckets.map(({ label, requests }) => ({ label, requests }));
}

export function lowStockSeeds(seeds: Seed[]) {
  return seeds
    .filter((s) => ["Low Stock", "Out of Stock"].includes(stockStatus(s)))
    .sort((a, b) => (availableQuantity(a) ?? 0) - (availableQuantity(b) ?? 0));
}

export const STATUS_ORDER: Record<OrderStatus, number> = Object.fromEntries(
  ORDER_STATUSES.map((s, i) => [s, i]),
) as Record<OrderStatus, number>;

/**
 * Pick list for the packing queue: one entry per seed with the total packets
 * to pack across all given orders, plus how many go to each order.
 * Sorted by storage location, then seed name, so stewards can walk the shelves.
 */
export function seedPickList(db: DataSnapshot, orders: Order[]) {
  const ids = new Set(orders.map((o) => o.id));
  const byId = new Map(orders.map((o) => [o.id, o]));
  const seeds = seedMap(db);
  const groups = new Map<
    string,
    { seed: Seed; total: number; packed: number; lines: { order: Order; item: DataSnapshot["order_items"][number] }[] }
  >();
  for (const item of db.order_items) {
    if (!ids.has(item.order_id) || !item.seed_id || (item.approved_quantity ?? 0) <= 0) continue;
    const seed = seeds.get(item.seed_id);
    if (!seed) continue;
    const g = groups.get(seed.id) ?? { seed, total: 0, packed: 0, lines: [] };
    g.total += item.approved_quantity!;
    g.packed += item.packed_quantity;
    g.lines.push({ order: byId.get(item.order_id)!, item });
    groups.set(seed.id, g);
  }
  for (const g of groups.values()) g.lines.sort((a, b) => a.order.order_number - b.order.order_number);
  return [...groups.values()].sort(
    (a, b) =>
      (a.seed.storage_location ?? "~").localeCompare(b.seed.storage_location ?? "~") ||
      seedLabel(a.seed).localeCompare(seedLabel(b.seed)),
  );
}
