import { describe, expect, it, beforeAll } from "vitest";
import os from "os";
import path from "path";
import { createLocalStore } from "../src/lib/store/local";

beforeAll(() => {
  process.env.SEEDFLOW_DATA_FILE = path.join(os.tmpdir(), `seedflow-test-${Date.now()}.json`);
});

describe("local demo store", () => {
  it("8. persists changes across store instances (page refresh)", async () => {
    const a = createLocalStore();
    await a.resetDemo();
    const kale = (await a.snapshot()).seeds.find((s) => s.name === "Kale")!;
    await a.setStockCount(kale.id, 99, "recount");
    const b = createLocalStore();
    const again = (await b.snapshot()).seeds.find((s) => s.id === kale.id)!;
    expect(again.physical_quantity).toBe(99);
  });

  it("9. concurrent approvals are serialized and cannot over-reserve", async () => {
    const store = createLocalStore();
    await store.resetDemo();
    const snap = await store.snapshot();
    const tomato = snap.seeds.find((s) => s.name === "Tomato" && s.variety === "Crimson Giant")!;
    const orders = await Promise.all(
      [1, 2, 3].map((n) =>
        store.createOrder({
          requester_name: "Race",
          organization_name: `School ${n}`,
          items: [{ requested_seed_name: "Tomato — Crimson Giant", requested_quantity: 20 }],
        }),
      ),
    );
    const after = await store.snapshot();
    const results = await Promise.allSettled(
      orders.map(({ order }) => {
        const item = after.order_items.find((i) => i.order_id === order.id)!;
        return store.approveOrder(order.id, [{ item_id: item.id, seed_id: tomato.id, approved_quantity: 20, unavailable: false }]);
      }),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const final = (await store.snapshot()).seeds.find((s) => s.id === tomato.id)!;
    expect(final.reserved_quantity).toBe(40);
    expect(final.physical_quantity).toBe(50);
  });
});
