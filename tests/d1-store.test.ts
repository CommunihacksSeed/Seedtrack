import type { D1Database } from "@cloudflare/workers-types";
import { readFileSync } from "fs";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOrder, DomainError } from "../src/lib/domain";
import { createD1Store } from "../src/lib/store/d1";
import type { SeedFlowStore } from "../src/lib/store/types";

// Runs against real D1 semantics (workerd + SQLite) through Miniflare.
let mf: Miniflare;
let db: D1Database;
let store: SeedFlowStore;

const TABLES = ["order_status_history", "inventory_movements", "order_items", "orders", "seeds", "store_meta"];
const statements = readFileSync("migrations/0001_schema.sql", "utf8")
  .replace(/^--.*$/gm, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok') } }", d1Databases: ["DB"] });
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
});
afterAll(() => mf.dispose());

beforeEach(async () => {
  await db.batch(TABLES.map((t) => db.prepare(`DROP TABLE IF EXISTS ${t}`)));
  await db.batch(statements.map((s) => db.prepare(s)));
  store = createD1Store(db);
  await store.resetDemo();
});

async function tomato() {
  return (await store.snapshot()).seeds.find((s) => s.name === "Tomato" && s.variety === "Crimson Giant")!;
}

function requests(n: number, qty: number) {
  return Promise.all(
    Array.from({ length: n }, (_, i) =>
      store.createOrder({
        requester_name: "Race",
        organization_name: `School ${i}`,
        items: [{ requested_seed_name: "Tomato — Crimson Giant", requested_quantity: qty }],
      }),
    ),
  );
}

async function approve(orderId: string, qty: number) {
  const seed = await tomato();
  const item = (await store.snapshot()).order_items.find((i) => i.order_id === orderId)!;
  return store.approveOrder(orderId, [{ item_id: item.id, seed_id: seed.id, approved_quantity: qty, unavailable: false }]);
}

describe("D1 store", () => {
  it("round-trips the demo snapshot, including booleans and JSON columns", async () => {
    const snap = await store.snapshot();
    expect(snap.seeds.length).toBeGreaterThan(0);
    expect(snap.orders.every((o) => Array.isArray(o.requested_bundles))).toBe(true);
    expect(snap.order_items.every((i) => typeof i.unavailable === "boolean")).toBe(true);
    expect(snap.orders.every((o) => o.school_use === null || typeof o.school_use === "boolean")).toBe(true);
  });

  it("persists across store instances", async () => {
    const kale = (await store.snapshot()).seeds.find((s) => s.name === "Kale")!;
    await store.setStockCount(kale.id, 99, "recount");
    const again = (await createD1Store(db).snapshot()).seeds.find((s) => s.id === kale.id)!;
    expect(again.physical_quantity).toBe(99);
  });

  it("concurrent approvals cannot over-reserve", async () => {
    const before = await tomato();
    const orders = await requests(3, 20);
    const results = await Promise.allSettled(orders.map(({ order }) => approve(order.id, 20)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((failed.reason as DomainError).code).toBe("insufficient_stock");
    const after = await tomato();
    expect(after.reserved_quantity).toBe(40);
    expect(after.physical_quantity).toBe(before.physical_quantity);
  });

  it("a double-clicked approve reserves only once", async () => {
    const [{ order }] = await requests(1, 10);
    const results = await Promise.allSettled([approve(order.id, 10), approve(order.id, 10)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await tomato()).reserved_quantity).toBe(10);
  });

  it("a double-clicked deliver deducts only once", async () => {
    const start = await tomato();
    const [{ order }] = await requests(1, 10);
    await approve(order.id, 10);
    const item = (await store.snapshot()).order_items.find((i) => i.order_id === order.id)!;
    await store.packItems(order.id, [{ item_id: item.id, packed_quantity: 10 }]);
    await store.markReady(order.id);
    const results = await Promise.allSettled([store.deliverOrder(order.id), store.deliverOrder(order.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const end = await tomato();
    expect(end.physical_quantity).toBe(start.physical_quantity! - 10);
    expect(end.reserved_quantity).toBe(0);
    const fulfilled = (await store.snapshot()).inventory_movements.filter((m) => m.order_id === order.id && m.movement_type === "fulfillment");
    expect(fulfilled).toHaveLength(1);
  });

  it("concurrent creates get distinct order numbers", async () => {
    const orders = await requests(8, 1);
    expect(new Set(orders.map((o) => o.order.order_number)).size).toBe(8);
  });

  it("the same Cognito entry imports once, even concurrently", async () => {
    const input = { external_entry_id: "E-1", requester_name: "A", organization_name: "B", items: [{ requested_seed_name: "Kale" }] };
    const [a, b] = await Promise.all([store.createOrder(input), store.createOrder(input)]);
    expect(a.order.id).toBe(b.order.id);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
  });

  it("a failed approval leaves nothing behind", async () => {
    const [{ order }] = await requests(1, 10);
    await expect(approve(order.id, 100000)).rejects.toMatchObject({ code: "insufficient_stock" });
    const snap = await store.snapshot();
    expect(snap.order_items.find((i) => i.order_id === order.id)!.approved_quantity).toBeNull();
    expect(snap.orders.find((o) => o.id === order.id)!.status).toBe("Received");
    expect((await tomato()).reserved_quantity).toBe(0);
  });

  it("cancelling releases the reservation without touching physical stock", async () => {
    const start = await tomato();
    const [{ order }] = await requests(1, 10);
    await approve(order.id, 10);
    await store.cancelOrder(order.id, "changed plans");
    const end = await tomato();
    expect(end.reserved_quantity).toBe(0);
    expect(end.physical_quantity).toBe(start.physical_quantity);
  });

  it("the CHECK constraint rejects over-reservation even if rules are bypassed", async () => {
    const seed = await tomato();
    await expect(
      db.prepare("UPDATE seeds SET reserved_quantity = ? WHERE id = ?").bind(seed.physical_quantity! + 1, seed.id).run(),
    ).rejects.toThrow(/seeds_reserved_le_physical/);
  });

  it("deleting a seed removes its movements", async () => {
    const seed = await store.createSeed({ name: "Temp", category: "Other", physical_quantity: 5 });
    await store.deleteSeed(seed.id);
    const snap = await store.snapshot();
    expect(snap.seeds.some((s) => s.id === seed.id)).toBe(false);
    expect(snap.inventory_movements.some((m) => m.seed_id === seed.id)).toBe(false);
  });

  it("imports 1000 orders in a single atomic write", async () => {
    const before = (await store.snapshot()).orders.length;
    const results = await store.transact((draft) =>
      Array.from({ length: 1000 }, (_, i) =>
        createOrder(draft, {
          external_entry_id: `BULK-${i}`,
          requester_name: "Bulk",
          organization_name: `School ${i}`,
          items: [{ requested_seed_name: "Kale", requested_quantity: 5 }],
        }),
      ),
    );
    expect(results).toHaveLength(1000);
    expect((await store.snapshot()).orders.length).toBe(before + 1000);
  }, 30000);
});
