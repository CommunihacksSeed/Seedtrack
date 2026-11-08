import { beforeEach, describe, expect, it } from "vitest";
import { approveOrder, availableQuantity, createOrder, createSeed, deliverPartial, emptySnapshot, packItems } from "../src/lib/domain";
import type { DataSnapshot, Seed } from "../src/lib/types";

let db: DataSnapshot;
let kale: Seed;
let basil: Seed;
const S = (id: string) => db.seeds.find((s) => s.id === id)!;
const itemsOf = (id: string) => db.order_items.filter((i) => i.order_id === id);

function approved(kaleQty: number, basilQty: number) {
  const { order } = createOrder(db, {
    requester_name: "Ms. Fictional",
    requester_email: "fictional@example.org",
    organization_name: "Maple Demo School",
    mailing_address: "1 Pretend Ave, Toronto",
    items: [
      { requested_seed_name: "Kale", requested_quantity: kaleQty },
      { requested_seed_name: "Basil", requested_quantity: basilQty },
    ],
  });
  approveOrder(db, order.id, itemsOf(order.id).map((i) => ({ item_id: i.id, seed_id: i.seed_id, approved_quantity: i.requested_quantity, unavailable: false })));
  return order;
}
const pack = (orderId: string, kaleQty: number, basilQty: number) => {
  const [k, b] = itemsOf(orderId);
  packItems(db, orderId, [
    { item_id: k.id, packed_quantity: kaleQty },
    { item_id: b.id, packed_quantity: basilQty },
  ]);
};

beforeEach(() => {
  db = emptySnapshot();
  kale = createSeed(db, { name: "Kale", variety: null, category: "Greens", physical_quantity: 20 });
  basil = createSeed(db, { name: "Basil", variety: null, category: "Herbs", physical_quantity: 10 });
});

describe("partial fulfilment", () => {
  it("sends only packed packets and releases the rest", () => {
    const o = approved(6, 4);
    pack(o.id, 6, 1);
    const r = deliverPartial(db, o.id, { followUp: false });
    expect(r).toMatchObject({ sent: 7, short: 3, followUp: null });
    expect(S(kale.id)).toMatchObject({ physical_quantity: 14, reserved_quantity: 0 });
    expect(S(basil.id)).toMatchObject({ physical_quantity: 9, reserved_quantity: 0 });
    expect(availableQuantity(S(basil.id))).toBe(9);
    expect(o.status).toBe("Delivered");
    expect(itemsOf(o.id).map((i) => i.approved_quantity)).toEqual([6, 1]);
    const note = db.order_status_history.filter((h) => h.order_id === o.id).at(-1)!.notes;
    expect(note).toMatch(/7 of 10 packets sent.*3 were released/);
  });

  it("can turn the shortfall into a follow-up request with the same contact details", () => {
    const o = approved(6, 4);
    pack(o.id, 2, 4);
    const r = deliverPartial(db, o.id, { followUp: true });
    expect(r.followUp).not.toBeNull();
    const f = r.followUp!;
    expect(f).toMatchObject({ status: "Received", source: "follow-up", requester_email: "fictional@example.org", mailing_address: "1 Pretend Ave, Toronto" });
    expect(itemsOf(f.id).map((i) => [i.requested_seed_name, i.requested_quantity, i.seed_id])).toEqual([["Kale", 4, kale.id]]);
    // Follow-up reserves nothing until staff approve it.
    expect(S(kale.id)).toMatchObject({ physical_quantity: 18, reserved_quantity: 0 });
  });

  it("refuses when nothing is packed, and never deducts twice", () => {
    const o = approved(6, 4);
    expect(() => deliverPartial(db, o.id, { followUp: false })).toThrow(/Nothing is packed/);
    pack(o.id, 1, 0);
    deliverPartial(db, o.id, { followUp: false });
    expect(() => deliverPartial(db, o.id, { followUp: false })).toThrow(/already delivered/);
    expect(S(kale.id).physical_quantity).toBe(19);
  });

  it("everything packed takes the normal full-delivery path", () => {
    const o = approved(6, 4);
    pack(o.id, 6, 4);
    const r = deliverPartial(db, o.id, { followUp: true });
    expect(r).toMatchObject({ sent: 10, short: 0, followUp: null });
    expect(S(kale.id)).toMatchObject({ physical_quantity: 14, reserved_quantity: 0 });
    expect(o.status).toBe("Delivered");
  });

  it("other orders' reservations are untouched", () => {
    const a = approved(6, 4);
    const b = approved(5, 5);
    pack(a.id, 3, 0);
    deliverPartial(db, a.id, { followUp: false });
    expect(S(kale.id)).toMatchObject({ physical_quantity: 17, reserved_quantity: 5 });
    expect(S(basil.id)).toMatchObject({ physical_quantity: 10, reserved_quantity: 5 });
    expect(b.status).toBe("Approved");
  });
});
