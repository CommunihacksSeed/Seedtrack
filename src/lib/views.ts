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

/**
 * Seed Requests views. The four top-level views group the seven statuses by
 * what staff do next; every status belongs to exactly one of the first three.
 */
export type RequestView = "open" | "progress" | "done" | "all";
export const REQUEST_VIEW_STATUSES: Record<RequestView, OrderStatus[]> = {
  open: ["Received", "Under Review"],
  progress: ["Approved", "Preparing", "Ready"],
  done: ["Delivered", "Cancelled"],
  all: [...ORDER_STATUSES],
};

/** Seed Inventory quick views, built on the existing stock rules. */
export type InventoryView = "all" | "uncounted" | "low" | "allocatable";
export const INVENTORY_VIEW_TEST: Record<InventoryView, (s: Seed) => boolean> = {
  all: () => true,
  // Unknown stock (null) is "needs count"; a real 0 is counted and is not.
  uncounted: (s) => s.physical_quantity === null,
  low: (s) => ["Low Stock", "Out of Stock"].includes(stockStatus(s)),
  allocatable: (s) => (availableQuantity(s) ?? 0) > 0,
};

/**
 * Seed Requests "By seed" view: every requested seed across the given orders,
 * grouped by crop category, with the packets asked for and which requests
 * asked. Items not yet matched to inventory are collected separately.
 */
export interface SeedDemandLine {
  order: Order;
  item: DataSnapshot["order_items"][number];
}
export interface SeedDemand {
  seed: Seed;
  /** Sum of the quantities requesters gave. */
  requested: number;
  /** Requests that didn't say how many packets. */
  unspecified: number;
  lines: SeedDemandLine[];
}
export function requestsBySeed(db: DataSnapshot, statuses: OrderStatus[]) {
  const orders = new Map(db.orders.filter((o) => statuses.includes(o.status)).map((o) => [o.id, o]));
  const seeds = seedMap(db);
  const bySeed = new Map<string, SeedDemand>();
  const unmatched: SeedDemandLine[] = [];
  for (const item of db.order_items) {
    const order = orders.get(item.order_id);
    if (!order) continue;
    const seed = item.seed_id ? seeds.get(item.seed_id) : undefined;
    if (!seed) {
      unmatched.push({ order, item });
      continue;
    }
    const d = bySeed.get(seed.id) ?? { seed, requested: 0, unspecified: 0, lines: [] };
    if (item.requested_quantity === null) d.unspecified++;
    else d.requested += item.requested_quantity;
    d.lines.push({ order, item });
    bySeed.set(seed.id, d);
  }
  const categories = new Map<string, SeedDemand[]>();
  for (const d of bySeed.values()) {
    d.lines.sort((a, b) => a.order.order_number - b.order.order_number);
    categories.set(d.seed.category, [...(categories.get(d.seed.category) ?? []), d]);
  }
  const groups = [...categories.entries()]
    .map(([category, seedsInCat]) => ({
      category,
      seeds: seedsInCat.sort((a, b) => b.lines.length - a.lines.length || seedLabel(a.seed).localeCompare(seedLabel(b.seed))),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
  return { groups, unmatched };
}
