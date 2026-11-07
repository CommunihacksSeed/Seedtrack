import { describe, expect, it, beforeEach } from "vitest";
import {
  approveOrder,
  availableQuantity,
  cancelOrder,
  createOrder,
  createSeed,
  deliverOrder,
  DomainError,
  emptySnapshot,
  markReady,
  matchSeed,
  packItems,
  setStockCount,
  stockStatus,
  deleteSeed,
  inventorySummary,
} from "../src/lib/domain";
import { buildDemoSnapshot } from "../src/lib/demo-data";
import type { DataSnapshot, Seed } from "../src/lib/types";

let db: DataSnapshot;
let tomato: Seed;

function order(qty: number | null, name = "Tomato — Crimson Giant", ext?: string) {
  return createOrder(db, {
    requester_name: "Test",
    organization_name: "Test School",
    external_entry_id: ext,
    items: [{ requested_seed_name: name, requested_quantity: qty }],
  });
}
const items = (orderId: string) => db.order_items.filter((i) => i.order_id === orderId);
const approveAll = (orderId: string, qty: number) =>
  approveOrder(
    db,
    orderId,
    items(orderId).map((i) => ({ item_id: i.id, seed_id: i.seed_id, approved_quantity: qty, unavailable: false })),
  );
const packAndReady = (orderId: string) => {
  packItems(db, orderId, items(orderId).map((i) => ({ item_id: i.id, packed_quantity: i.approved_quantity ?? 0 })));
  markReady(db, orderId);
};
const seed = () => db.seeds.find((s) => s.id === tomato.id)!;

beforeEach(() => {
  db = emptySnapshot();
  tomato = createSeed(db, {
    name: "Tomato",
    variety: "Crimson Giant",
    category: "Fruits / Fruiting Vegetables",
    physical_quantity: 50,
  });
});

describe("acceptance tests", () => {
  it("1. normal allocation reserves without touching physical stock", () => {
    const { order: o } = order(10);
    approveAll(o.id, 10);
    expect(seed().physical_quantity).toBe(50);
    expect(seed().reserved_quantity).toBe(10);
    expect(availableQuantity(seed())).toBe(40);
    expect(o.status).toBe("Approved");
  });

  it("2. over-allocation is rejected and leaves reservations unchanged", () => {
    const a = order(45).order;
    approveAll(a.id, 45);
    const b = order(10).order;
    expect(() => approveAll(b.id, 10)).toThrow(/Insufficient stock/);
    expect(seed().reserved_quantity).toBe(45);
    expect(db.orders.find((o) => o.id === b.id)!.status).toBe("Received");
    expect(items(b.id)[0].approved_quantity).toBeNull(); // failed review edits not persisted
  });

  it("3. delivery deducts physical stock and releases the reservation", () => {
    const { order: o } = order(10);
    approveAll(o.id, 10);
    packAndReady(o.id);
    deliverOrder(db, o.id);
    expect(seed().physical_quantity).toBe(40);
    expect(seed().reserved_quantity).toBe(0);
    expect(availableQuantity(seed())).toBe(40);
  });

  it("4. cancelling an approved order releases stock without deducting", () => {
    const { order: o } = order(10);
    approveAll(o.id, 10);
    cancelOrder(db, o.id);
    expect(seed().physical_quantity).toBe(50);
    expect(seed().reserved_quantity).toBe(0);
    expect(db.inventory_movements.filter((m) => m.movement_type === "release")).toHaveLength(1);
  });

  it("5. delivering twice deducts stock exactly once", () => {
    const { order: o } = order(10);
    approveAll(o.id, 10);
    packAndReady(o.id);
    deliverOrder(db, o.id);
    expect(() => deliverOrder(db, o.id)).toThrow(/already delivered/);
    expect(seed().physical_quantity).toBe(40);
    expect(db.inventory_movements.filter((m) => m.movement_type === "fulfillment")).toHaveLength(1);
  });

  it("6. unknown stock shows Needs Stock Count and cannot be allocated", () => {
    const basil = createSeed(db, { name: "Basil", category: "Herbs", physical_quantity: null });
    expect(stockStatus(basil)).toBe("Needs Stock Count");
    expect(availableQuantity(basil)).toBeNull();
    const { order: o } = order(null, "Basil");
    expect(items(o.id)[0].seed_id).toBe(basil.id);
    expect(() => approveAll(o.id, 3)).toThrow(/Stock Count Required/);
    expect(inventorySummary(db.seeds).physical).toBe(50); // unknown not counted as 0 or anything
    expect(inventorySummary(db.seeds).uncounted).toBe(1);
  });

  it("7. requests without quantities import and need staff decisions", () => {
    const { order: o } = order(null);
    expect(items(o.id)[0].requested_quantity).toBeNull();
    expect(() => approveOrder(db, o.id, null)).toThrow(/Set an approved quantity/);
    approveAll(o.id, 4);
    expect(seed().reserved_quantity).toBe(4);
  });

  it("9. competing approvals cannot exceed physical stock", () => {
    const a = order(30).order;
    const b = order(30).order;
    approveAll(a.id, 30);
    expect(() => approveAll(b.id, 30)).toThrow(DomainError);
    expect(seed().reserved_quantity).toBe(30);
  });

  it("10. duplicate external entry IDs create one order", () => {
    const first = order(5, "Tomato — Crimson Giant", "COG-77");
    const second = order(5, "Tomato — Crimson Giant", "COG-77");
    expect(second.duplicate).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(db.orders).toHaveLength(1);
    expect(db.order_items).toHaveLength(1);
  });
});

describe("other rules", () => {
  it("approving twice never reserves twice", () => {
    const { order: o } = order(10);
    approveAll(o.id, 10);
    expect(() => approveAll(o.id, 10)).toThrow(/already been approved/);
    expect(seed().reserved_quantity).toBe(10);
  });

  it("unmatched items need an inventory match before approval", () => {
    const { order: o } = order(5, "Cherokee Purple Tomato");
    expect(items(o.id)[0].seed_id).toBeNull();
    expect(() => approveAll(o.id, 5)).toThrow(/Inventory Match Required/);
  });

  it("ambiguous names are not auto-matched", () => {
    createSeed(db, { name: "Tomato", variety: "Blueberry", category: "Fruits / Fruiting Vegetables", physical_quantity: 5 });
    expect(matchSeed("Tomato", db.seeds)).toBeNull();
    expect(matchSeed("tomato crimson giant", db.seeds)?.id).toBe(tomato.id);
    expect(matchSeed("Crimson Giant Tomato", db.seeds)?.id).toBe(tomato.id);
  });

  it("stock counts can't go below reserved and must be whole numbers", () => {
    const { order: o } = order(10);
    approveAll(o.id, 10);
    expect(() => setStockCount(db, tomato.id, 5)).toThrow(/cannot be lower/);
    expect(() => setStockCount(db, tomato.id, -1)).toThrow();
    expect(() => setStockCount(db, tomato.id, 2.5)).toThrow();
    setStockCount(db, tomato.id, 60);
    expect(availableQuantity(seed())).toBe(50);
  });

  it("can't mark Ready until everything is packed", () => {
    const { order: o } = order(10);
    approveAll(o.id, 10);
    packItems(db, o.id, [{ item_id: items(o.id)[0].id, packed_quantity: 6 }]);
    expect(() => markReady(db, o.id)).toThrow(/Not all approved items are packed/);
    expect(() => packItems(db, o.id, [{ item_id: items(o.id)[0].id, packed_quantity: 11 }])).toThrow();
  });

  it("seeds used by active orders can't be deleted", () => {
    order(10);
    expect(() => deleteSeed(db, tomato.id)).toThrow(/active order/);
  });

  it("demo dataset builds and matches the spec's starting numbers", () => {
    const demo = buildDemoSnapshot();
    const t = demo.seeds.find((s) => s.name === "Tomato" && s.variety === "Crimson Giant")!;
    expect(t.physical_quantity).toBe(50);
    expect(t.reserved_quantity).toBe(0);
    const radish = demo.seeds.find((s) => s.name === "Radish")!;
    expect(radish.reserved_quantity).toBe(6);
    expect(demo.seeds.find((s) => s.name === "Basil")!.physical_quantity).toBeNull();
    expect(demo.orders.filter((o) => o.status === "Delivered")).toHaveLength(2);
  });
});

describe("bundles, delivery and settings", () => {
  it("adds bundle items without duplicating seeds already requested", async () => {
    const { saveBundle, addBundleItems } = await import("../src/lib/domain");
    const kale = createSeed(db, { name: "Kale", category: "Greens", physical_quantity: 20 });
    const b = saveBundle(db, null, { name: "Spring", items: [{ seed_id: kale.id, quantity: 2 }, { seed_id: tomato.id, quantity: 3 }] });
    const { order: o } = order(null); // already has tomato
    expect(addBundleItems(db, o.id, b.id)).toBe(1);
    const k = items(o.id).find((i) => i.seed_id === kale.id)!;
    expect(k.requested_quantity).toBe(2);
    expect(addBundleItems(db, o.id, b.id)).toBe(0);
    expect(() => saveBundle(db, null, { name: "spring", items: [] })).toThrow(/already exists/);
  });

  it("validates delivery details", async () => {
    const { setDelivery } = await import("../src/lib/domain");
    const { order: o } = order(1);
    setDelivery(db, o.id, { delivery_method: "drop-off", delivery_lat: 45.4, delivery_lng: -75.7 });
    expect(o.delivery_method).toBe("drop-off");
    expect(() => setDelivery(db, o.id, { delivery_lat: 95 })).toThrow(/out of range/);
    expect(() => setDelivery(db, o.id, { delivery_lat: null })).toThrow(/both latitude and longitude/);
    setDelivery(db, o.id, { delivery_lat: null, delivery_lng: null });
    expect(o.delivery_lat).toBeNull();
  });

  it("validates settings updates", async () => {
    const { updateSettings } = await import("../src/lib/domain");
    expect(db.settings.notifications.enabled).toBe(false); // off by default
    updateSettings(db, { notifications: { enabled: true, events: { low_stock: false } } });
    expect(db.settings.notifications.enabled).toBe(true);
    expect(db.settings.notifications.events.low_stock).toBe(false);
    expect(db.settings.notifications.events.order_approved).toBe(true);
    expect(() => updateSettings(db, { allocation: { min: 6, max: 5 } })).toThrow(/Minimum/);
    expect(() => updateSettings(db, { delivery: { max_stops_per_trip: 0 } })).toThrow();
  });

  it("suggests quantities from settings", async () => {
    const { suggestQuantity } = await import("../src/lib/allocation");
    const a = { mode: "per_students" as const, fixed: 2, students_per_packet: 10, min: 1, max: 5 };
    expect(suggestQuantity(a, 40)).toBe(4);
    expect(suggestQuantity(a, 3)).toBe(1);
    expect(suggestQuantity(a, 200)).toBe(5);
    expect(suggestQuantity(a, null)).toBe(1);
    expect(suggestQuantity({ ...a, mode: "fixed" }, 40)).toBe(2);
    expect(suggestQuantity({ ...a, mode: "none" }, 40)).toBeNull();
  });
});
