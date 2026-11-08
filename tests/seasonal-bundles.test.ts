import { describe, expect, it } from "vitest";
import { addBundleItems, approveOrder, createOrder, createSeed, deliverOrder, emptySnapshot, markReady, packItems, seedLabel } from "../src/lib/domain";
import { buildDemoSnapshot } from "../src/lib/demo-data";
import { FICTIONAL_COUNT, SEASONAL_BUNDLES, addSeasonalBundles } from "../src/lib/seasonal-bundles";

describe("seasonal bundles", () => {
  it("adds Spring, Summer, Autumn and Winter with four seeds each", () => {
    const db = emptySnapshot();
    const r = addSeasonalBundles(db);
    expect(r.bundles).toEqual(["Spring Bundle", "Summer Bundle", "Autumn Bundle", "Winter Bundle"]);
    expect(db.bundles).toHaveLength(4);
    for (const b of db.bundles) {
      expect(b.items).toHaveLength(4);
      expect(new Set(b.items.map((i) => i.seed_id)).size).toBe(4);
      for (const i of b.items) expect(db.seeds.find((s) => s.id === i.seed_id)!.physical_quantity).toBe(FICTIONAL_COUNT);
    }
    expect(r.seedsCreated).toBe(16);
  });

  it("is safe to run twice and never changes real counts or existing bundles", () => {
    const db = emptySnapshot();
    const kale = createSeed(db, { name: "Kale", variety: "Red Russian", category: "Greens", physical_quantity: 7 });
    addSeasonalBundles(db);
    const again = addSeasonalBundles(db);
    expect(again).toEqual({ bundles: [], seedsCreated: 0, seedsCounted: 0 });
    expect(db.bundles).toHaveLength(4);
    expect(db.seeds.find((s) => s.id === kale.id)!.physical_quantity).toBe(7);
    expect(db.bundles.find((b) => b.name === "Autumn Bundle")!.items.some((i) => i.seed_id === kale.id)).toBe(true);
  });

  it("a request for a bundle can be filled: add its seeds, approve, pack, deliver", () => {
    const db = emptySnapshot();
    addSeasonalBundles(db);
    const { order } = createOrder(db, { requester_name: "Fictional Teacher", organization_name: "Demo School", requested_bundles: ["Winter Bundle"], items: [] });
    const winter = db.bundles.find((b) => b.name === "Winter Bundle")!;
    expect(addBundleItems(db, order.id, winter.id)).toBe(4);
    const items = db.order_items.filter((i) => i.order_id === order.id);
    expect(items.map((i) => i.requested_seed_name).sort()).toEqual(
      SEASONAL_BUNDLES[3].seeds.map((s) => seedLabel({ name: s.name, variety: s.variety })).sort(),
    );
    approveOrder(db, order.id, items.map((i) => ({ item_id: i.id, seed_id: i.seed_id, approved_quantity: 1, unavailable: false })));
    packItems(db, order.id, items.map((i) => ({ item_id: i.id, packed_quantity: 1 })));
    markReady(db, order.id);
    deliverOrder(db, order.id);
    for (const i of winter.items) expect(db.seeds.find((s) => s.id === i.seed_id)!.physical_quantity).toBe(FICTIONAL_COUNT - 1);
  });

  it("the demo dataset has the four seasonal bundles", () => {
    const db = buildDemoSnapshot();
    expect(db.bundles.map((b) => b.name).sort()).toEqual(["Autumn Bundle", "Spring Bundle", "Summer Bundle", "Winter Bundle"]);
    expect(db.seeds.find((s) => s.name === "Basil")!.physical_quantity).toBeNull();
  });
});
