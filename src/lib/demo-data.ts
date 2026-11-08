/**
 * DEMO DATA — every quantity, school, person, email and address below is
 * FICTIONAL. YFS has not provided real inventory counts. Seed names and
 * varieties come from YFS's real 2026 catalogue (see seed-catalogue.ts); every
 * stock number and storage location is made up (see sample-inventory.ts). The real form PDFs
 * were used only to understand field structure; no real requester details are
 * copied here.
 */
import {
  approveOrder,
  createOrder,
  createSeed,
  deliverOrder,
  emptySnapshot,
  markReady,
  packItems,
  setDelivery,
  updateSettings,
} from "./domain";
import type { DataSnapshot, SeedInput } from "./types";
import { SEED_CATALOGUE_2026 } from "./seed-catalogue";
import { loadSampleInventory } from "./sample-inventory";

function daysAgo(n: number, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const SEEDS: SeedInput[] = [
  { name: "Tomato", variety: "Crimson Giant", category: "Fruits / Fruiting Vegetables", description: "Large tomato", physical_quantity: 50, low_stock_threshold: 10, storage_location: "Shelf A1" },
  { name: "Tomato", variety: "Blue Berries", category: "Fruits / Fruiting Vegetables", description: "Cherry tomato", physical_quantity: 25, low_stock_threshold: 8, storage_location: "Shelf A1" },
  { name: "Kale", variety: "Red Russian", category: "Greens", physical_quantity: 45, low_stock_threshold: 10, storage_location: "Shelf B2" },
  { name: "Spinach", variety: "Butterflay", category: "Greens", physical_quantity: 35, low_stock_threshold: 10, storage_location: "Shelf B2" },
  { name: "Cucumber", variety: "Marketmore", category: "Fruits / Fruiting Vegetables", physical_quantity: 30, low_stock_threshold: 8, storage_location: "Shelf A2" },
  { name: "Radish", variety: "French Breakfast", category: "Root Vegetables", physical_quantity: 65, low_stock_threshold: 15, storage_location: "Shelf C1" },
  { name: "Bok Choy", category: "Greens", physical_quantity: 26, low_stock_threshold: 8, storage_location: "Shelf B3" },
  { name: "Pumpkin", variety: "Howden Field", category: "Fruits / Fruiting Vegetables", physical_quantity: 19, low_stock_threshold: 5, storage_location: "Shelf A3" },
  { name: "Carrot", variety: "Nantes Coreless", category: "Root Vegetables", physical_quantity: 53, low_stock_threshold: 10, storage_location: "Shelf C1" },
  { name: "Bean", variety: "Royal Burgundy", category: "Legumes", physical_quantity: 6, low_stock_threshold: 10, storage_location: "Shelf D1" },
  { name: "Sunflower", variety: "Large Grey Striped", category: "Flowers", physical_quantity: 0, low_stock_threshold: 5, storage_location: "Shelf E1" },
  { name: "Basil", variety: "Genovese", category: "Herbs", physical_quantity: null, low_stock_threshold: 5, description: "Not counted yet — stock count needed before allocating." },
];

export function buildDemoSnapshot(): DataSnapshot {
  const db = emptySnapshot();
  for (const s of SEEDS) createSeed(db, s, daysAgo(30, 9));
  // The rest of the 2026 catalogue with fictional counts and drawers. Basil stays "not counted" on purpose.
  loadSampleInventory(db, { fillUncounted: false });

  // Bundles (Spring, Fall Harvest, Herbs/Edible Flowers) come from loadSampleInventory above.

  updateSettings(db, {
    notifications: { staff_email: "staff@example.org" },
    allocation: { mode: "per_students", students_per_packet: 10, min: 1, max: 5 },
    delivery: { depot_name: "YFS seed hub (demo location)", depot_address: "Downtown Ottawa, ON (demo)", depot_lat: 45.4215, depot_lng: -75.6972 },
  });
  // Fictional coordinates for the fictional addresses below.
  const place = (orderId: string, method: "drop-off" | "mail" | "pickup", lat: number, lng: number) =>
    setDelivery(db, orderId, { delivery_method: method, delivery_lat: lat, delivery_lng: lng });

  const fulfil = (orderId: string, at: number) => {
    const items = db.order_items.filter((i) => i.order_id === orderId);
    approveOrder(
      db,
      orderId,
      items.map((i) => ({ item_id: i.id, seed_id: i.seed_id, approved_quantity: i.requested_quantity, unavailable: false })),
      daysAgo(at, 11),
    );
    packItems(db, orderId, items.map((i) => ({ item_id: i.id, packed_quantity: i.approved_quantity ?? 0 })), daysAgo(at - 1, 10));
    markReady(db, orderId, daysAgo(at - 1, 15));
    deliverOrder(db, orderId, daysAgo(at - 2, 13));
  };

  // Historical delivered orders (for the dashboard charts).
  const e = createOrder(
    db,
    {
      requester_name: "Jordan Example",
      requester_email: "jordan@example.org",
      organization_name: "Lakeside Youth Garden",
      school_use: false,
      mailing_address: "100 Demo Lane, Ottawa, ON",
      student_count: 18,
      source: "manual",
      submitted_at: daysAgo(24),
      items: [
        { requested_seed_name: "Bok Choy", requested_quantity: 6 },
        { requested_seed_name: "Pumpkin — Howden Field", requested_quantity: 4 },
        { requested_seed_name: "Radish — French Breakfast", requested_quantity: 5 },
      ],
    },
    daysAgo(24),
  ).order;
  place(e.id, "drop-off", 45.3601, -75.7262);
  fulfil(e.id, 22);

  const f = createOrder(
    db,
    {
      requester_name: "Sam Placeholder",
      requester_email: "sam@example.org",
      organization_name: "Northview Secondary Eco Club",
      school_use: true,
      mailing_address: "200 Sample Road, Toronto, ON",
      student_count: 25,
      source: "csv",
      submitted_at: daysAgo(16),
      items: [
        { requested_seed_name: "Carrot — Nantes Coreless", requested_quantity: 8 },
        { requested_seed_name: "Kale — Red Russian", requested_quantity: 5 },
      ],
    },
    daysAgo(16),
  ).order;
  place(f.id, "mail", 43.7, -79.42);
  fulfil(f.id, 14);

  // Order C — already approved (reserves 6 radish).
  const c = createOrder(
    db,
    {
      requester_name: "Alex Demo",
      requester_email: "alex@example.org",
      organization_name: "Community Garden Network",
      school_use: false,
      mailing_address: "300 Fictional Ave, Ottawa, ON",
      student_count: 12,
      source: "manual",
      submitted_at: daysAgo(6),
      items: [{ requested_seed_name: "Radish — French Breakfast", requested_quantity: 6 }],
    },
    daysAgo(6),
  ).order;
  place(c.id, "drop-off", 45.411, -75.735);
  const cItems = db.order_items.filter((i) => i.order_id === c.id);
  approveOrder(db, c.id, cItems.map((i) => ({ item_id: i.id, seed_id: i.seed_id, approved_quantity: 6, unavailable: false })), daysAgo(5));

  // Order A — the main demo order (10 tomato).
  const a = createOrder(
    db,
    {
      requester_name: "Taylor Sample",
      requester_email: "taylor@example.org",
      organization_name: "Riverside Community School",
      school_use: true,
      mailing_address: "400 Example Street, Ottawa, ON",
      student_count: 28,
      requested_bundles: ["Spring Bundle"],
      special_requests: "Please include planting guides if available.",
      garden_support: false,
      source: "manual",
      submitted_at: daysAgo(3),
      items: [
        { requested_seed_name: "Tomato — Crimson Giant", requested_quantity: 10 },
        { requested_seed_name: "Kale — Red Russian", requested_quantity: 5 },
      ],
    },
    daysAgo(3),
  ).order;
  place(a.id, "drop-off", 45.3876, -75.696);

  const b = createOrder(
    db,
    {
      requester_name: "Morgan Test",
      requester_email: "morgan@example.org",
      organization_name: "Green Valley Learning Centre",
      school_use: true,
      mailing_address: "500 Placeholder Blvd, Kingston, ON",
      student_count: 15,
      source: "csv",
      submitted_at: daysAgo(2),
      items: [
        { requested_seed_name: "Spinach — Butterflay", requested_quantity: 8 },
        { requested_seed_name: "Cucumber — Marketmore", requested_quantity: 4 },
      ],
    },
    daysAgo(2),
  ).order;
  place(b.id, "mail", 44.2312, -76.486);

  // Order D — shaped like a real Cognito submission: bundles + varieties, no quantities.
  const d = createOrder(
    db,
    {
      external_entry_id: "DEMO-12",
      requester_name: "Riley Fictional",
      requester_email: "riley@example.org",
      organization_name: "Maple Grove Public School",
      school_use: true,
      mailing_address: "600 Demo Crescent, Ottawa, ON",
      student_count: 40,
      requested_bundles: ["Spring Bundle", "Herbs/Edible Flowers"],
      special_requests: "Grade 4 class garden. Happy with any tomato variety.",
      garden_support: true,
      seed_donation_interest: false,
      source: "cognito-import",
      submitted_at: daysAgo(1),
      items: [
        { requested_seed_name: "Kale — Red Russian" },
        { requested_seed_name: "Spinach — Butterflay" },
        { requested_seed_name: "Basil — Genovese" },
        { requested_seed_name: "Cherokee Purple Tomato" },
      ],
    },
    daysAgo(1),
  ).order;
  place(d.id, "drop-off", 45.347, -75.76);

  // The rest of the real YFS 2026 seed catalogue, added after the demo orders so
  // their seed names still match uniquely. Real varieties, but not counted yet.
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  for (const s of SEED_CATALOGUE_2026) {
    if (db.seeds.some((x) => norm(x.name) === norm(s.name) && norm(x.variety) === norm(s.variety))) continue;
    createSeed(db, s, daysAgo(30, 9));
  }

  return db;
}
