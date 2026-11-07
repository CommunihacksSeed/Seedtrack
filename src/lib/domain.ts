/**
 * SeedFlow business rules.
 *
 * Every function here operates on a mutable DataSnapshot draft and throws a
 * DomainError before mutating anything if a rule would be violated. The local
 * demo store applies these functions to a copy under a lock; the Supabase
 * schema re-implements the same rules as transactional SQL functions
 * (supabase/migrations/0002_functions.sql).
 */
import {
  ACTIVE_STATUSES,
  AppSettings,
  Bundle,
  BundleInput,
  DataSnapshot,
  DELIVERY_METHODS,
  DeliveryInput,
  NOTIFICATION_EVENTS,
  NotificationLogEntry,
  InventoryMovement,
  MovementType,
  Order,
  OrderInput,
  OrderItem,
  OrderStatus,
  PackItemInput,
  RESERVING_STATUSES,
  REVIEWABLE_STATUSES,
  ReviewItemInput,
  Seed,
  SeedInput,
  StockStatus,
} from "./types";

export class DomainError extends Error {
  constructor(
    message: string,
    public status: number = 400,
    public code: string = "invalid",
  ) {
    super(message);
    this.name = "DomainError";
  }
}

const uuid = () => crypto.randomUUID();
const iso = () => new Date().toISOString();

// ---------- Inventory helpers ----------

export function availableQuantity(seed: Pick<Seed, "physical_quantity" | "reserved_quantity">) {
  if (seed.physical_quantity === null) return null;
  return seed.physical_quantity - seed.reserved_quantity;
}

export function stockStatus(seed: Seed): StockStatus {
  if (seed.physical_quantity === null) return "Needs Stock Count";
  const available = availableQuantity(seed)!;
  if (available <= 0) return "Out of Stock";
  if (seed.low_stock_threshold !== null && available <= seed.low_stock_threshold) return "Low Stock";
  return "Available";
}

export function seedLabel(seed: Pick<Seed, "name" | "variety">) {
  return seed.variety ? `${seed.name} — ${seed.variety}` : seed.name;
}

function assertNonNegInt(value: unknown, field: string, allowNull = false) {
  if (value === null || value === undefined) {
    if (allowNull) return;
    throw new DomainError(`${field} is required.`);
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new DomainError(`${field} must be a whole number of 0 or more.`);
  }
}

function getSeed(db: DataSnapshot, id: string) {
  const seed = db.seeds.find((s) => s.id === id);
  if (!seed) throw new DomainError("Seed not found.", 404, "not_found");
  return seed;
}

function getOrder(db: DataSnapshot, id: string) {
  const order = db.orders.find((o) => o.id === id);
  if (!order) throw new DomainError("Order not found.", 404, "not_found");
  return order;
}

function itemsOf(db: DataSnapshot, orderId: string) {
  return db.order_items.filter((i) => i.order_id === orderId);
}

function recordMovement(
  db: DataSnapshot,
  seed: Seed,
  type: MovementType,
  quantity: number,
  orderId: string | null,
  notes: string | null,
  at: string,
) {
  const m: InventoryMovement = {
    id: uuid(),
    seed_id: seed.id,
    order_id: orderId,
    movement_type: type,
    quantity,
    physical_after: seed.physical_quantity,
    reserved_after: seed.reserved_quantity,
    notes,
    created_at: at,
  };
  db.inventory_movements.push(m);
  return m;
}

function setStatus(db: DataSnapshot, order: Order, next: OrderStatus, notes: string | null, at: string) {
  db.order_status_history.push({
    id: uuid(),
    order_id: order.id,
    previous_status: order.status,
    new_status: next,
    notes,
    changed_at: at,
  });
  order.status = next;
  order.updated_at = at;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Match a free-text requested seed name to exactly one inventory record.
 * Returns null when there is no match or the match is ambiguous: staff then
 * have to pick the inventory item ("Inventory Match Required").
 */
export function matchSeed(requested: string, seeds: Seed[]): Seed | null {
  const q = norm(requested);
  if (!q) return null;
  const exact = seeds.filter((s) => {
    const full = norm(seedLabel(s));
    const alt = s.variety ? norm(`${s.variety} ${s.name}`) : null;
    return full === q || alt === q || (!s.variety && norm(s.name) === q);
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  // Name-only request ("Kale") matches only if a single seed has that name.
  const byName = seeds.filter((s) => norm(s.name) === q);
  if (byName.length === 1) return byName[0];
  return null;
}

// ---------- Seeds ----------

export function createSeed(db: DataSnapshot, input: SeedInput, at = iso()): Seed {
  if (!input.name?.trim()) throw new DomainError("Seed name is required.");
  assertNonNegInt(input.physical_quantity, "Physical quantity", true);
  assertNonNegInt(input.low_stock_threshold, "Low-stock threshold", true);
  const variety = input.variety?.trim() || null;
  const dupe = db.seeds.find(
    (s) => norm(s.name) === norm(input.name) && norm(s.variety ?? "") === norm(variety ?? ""),
  );
  if (dupe) throw new DomainError(`"${seedLabel(dupe)}" already exists in inventory.`, 409, "duplicate");
  const seed: Seed = {
    id: uuid(),
    name: input.name.trim(),
    variety,
    category: input.category,
    description: input.description?.trim() || null,
    physical_quantity: input.physical_quantity ?? null,
    reserved_quantity: 0,
    unit: input.unit?.trim() || "packets",
    storage_location: input.storage_location?.trim() || null,
    low_stock_threshold: input.low_stock_threshold ?? null,
    created_at: at,
    updated_at: at,
  };
  db.seeds.push(seed);
  if (seed.physical_quantity !== null) {
    recordMovement(db, seed, "initial", seed.physical_quantity, null, "Initial stock entry", at);
  }
  return seed;
}

/** Update descriptive fields only. Quantities change through setStockCount. */
export function updateSeedDetails(
  db: DataSnapshot,
  id: string,
  input: Partial<Omit<SeedInput, "physical_quantity">>,
  at = iso(),
): Seed {
  const seed = getSeed(db, id);
  if (input.name !== undefined && !input.name.trim()) throw new DomainError("Seed name is required.");
  if (input.low_stock_threshold !== undefined) assertNonNegInt(input.low_stock_threshold, "Low-stock threshold", true);
  if (input.name !== undefined) seed.name = input.name.trim();
  if (input.variety !== undefined) seed.variety = input.variety?.trim() || null;
  if (input.category !== undefined) seed.category = input.category;
  if (input.description !== undefined) seed.description = input.description?.trim() || null;
  if (input.unit !== undefined) seed.unit = input.unit?.trim() || "packets";
  if (input.storage_location !== undefined) seed.storage_location = input.storage_location?.trim() || null;
  if (input.low_stock_threshold !== undefined) seed.low_stock_threshold = input.low_stock_threshold ?? null;
  seed.updated_at = at;
  return seed;
}

/** Record a physical stock count (or mark as not counted with null). */
export function setStockCount(
  db: DataSnapshot,
  id: string,
  physical: number | null,
  notes: string | null = null,
  at = iso(),
): Seed {
  const seed = getSeed(db, id);
  assertNonNegInt(physical, "Physical quantity", true);
  if (physical === null) {
    if (seed.reserved_quantity > 0)
      throw new DomainError("Cannot mark stock as uncounted while packets are reserved for orders.", 409);
  } else if (physical < seed.reserved_quantity) {
    throw new DomainError(
      `Physical stock cannot be lower than the ${seed.reserved_quantity} packets already reserved for approved orders.`,
      409,
      "below_reserved",
    );
  }
  const before = seed.physical_quantity;
  if (before === physical) return seed;
  seed.physical_quantity = physical;
  seed.updated_at = at;
  if (physical !== null) {
    const type: MovementType = before === null ? "initial" : "adjustment";
    recordMovement(db, seed, type, physical - (before ?? 0), null, notes || (before === null ? "First stock count" : "Stock count updated"), at);
  }
  return seed;
}

export function deleteSeed(db: DataSnapshot, id: string) {
  const seed = getSeed(db, id);
  const activeOrderIds = new Set(db.orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).map((o) => o.id));
  const inUse = db.order_items.some((i) => i.seed_id === id && activeOrderIds.has(i.order_id));
  if (inUse || seed.reserved_quantity > 0)
    throw new DomainError("This seed is referenced by an active order and cannot be deleted.", 409, "in_use");
  const referenced = db.order_items.some((i) => i.seed_id === id);
  if (referenced)
    throw new DomainError("This seed appears in past orders. Keep it for reporting history instead of deleting.", 409, "in_use");
  db.seeds = db.seeds.filter((s) => s.id !== id);
  db.inventory_movements = db.inventory_movements.filter((m) => m.seed_id !== id);
  for (const b of db.bundles) b.items = b.items.filter((i) => i.seed_id !== id);
}

// ---------- Orders ----------

export function createOrder(
  db: DataSnapshot,
  input: OrderInput,
  at = iso(),
): { order: Order; duplicate: boolean } {
  const ext = input.external_entry_id?.trim() || null;
  if (ext) {
    const existing = db.orders.find((o) => o.external_entry_id === ext);
    if (existing) return { order: existing, duplicate: true };
  }
  if (!input.requester_name?.trim()) throw new DomainError("Requester name is required.");
  if (!input.organization_name?.trim()) throw new DomainError("Organization or school name is required.");
  assertNonNegInt(input.student_count, "Number of students", true);
  const items = (input.items ?? []).filter((i) => i.requested_seed_name?.trim());
  const bundles = (input.requested_bundles ?? []).map((b) => b.trim()).filter(Boolean);
  if (items.length === 0 && bundles.length === 0)
    throw new DomainError("A request needs at least one seed variety or bundle.");
  for (const i of items) assertNonNegInt(i.requested_quantity, `Quantity for ${i.requested_seed_name}`, true);

  const order: Order = {
    id: uuid(),
    order_number: db.next_order_number++,
    external_entry_id: ext,
    requester_name: input.requester_name.trim(),
    requester_email: input.requester_email?.trim() || null,
    organization_name: input.organization_name.trim(),
    school_use: input.school_use ?? null,
    mailing_address: input.mailing_address?.trim() || null,
    student_count: input.student_count ?? null,
    requested_bundles: bundles,
    special_requests: input.special_requests?.trim() || null,
    garden_support: input.garden_support ?? null,
    seed_donation_interest: input.seed_donation_interest ?? null,
    assigned_steward: null,
    delivery_method: null,
    delivery_lat: null,
    delivery_lng: null,
    status: "Received",
    source: input.source || "manual",
    submitted_at: input.submitted_at || at,
    approved_at: null,
    ready_at: null,
    delivered_at: null,
    cancelled_at: null,
    created_at: at,
    updated_at: at,
  };
  db.orders.push(order);
  db.order_status_history.push({
    id: uuid(),
    order_id: order.id,
    previous_status: null,
    new_status: "Received",
    notes: `Request created (${order.source})`,
    changed_at: at,
  });
  for (const i of items) {
    const explicit = i.seed_id ? db.seeds.find((s) => s.id === i.seed_id) : null;
    const matched = explicit ?? matchSeed(i.requested_seed_name, db.seeds);
    db.order_items.push({
      id: uuid(),
      order_id: order.id,
      seed_id: matched?.id ?? null,
      requested_seed_name: i.requested_seed_name.trim(),
      requested_quantity: i.requested_quantity ?? null,
      approved_quantity: null,
      packed_quantity: 0,
      unavailable: false,
      created_at: at,
    });
  }
  return { order, duplicate: false };
}

export function addOrderItem(db: DataSnapshot, orderId: string, name: string, at = iso()): OrderItem {
  const order = getOrder(db, orderId);
  if (!REVIEWABLE_STATUSES.includes(order.status))
    throw new DomainError("Items can only be added while the request is under review.", 409);
  if (!name.trim()) throw new DomainError("Seed name is required.");
  const matched = matchSeed(name, db.seeds);
  const item: OrderItem = {
    id: uuid(),
    order_id: orderId,
    seed_id: matched?.id ?? null,
    requested_seed_name: name.trim(),
    requested_quantity: null,
    approved_quantity: null,
    packed_quantity: 0,
    unavailable: false,
    created_at: at,
  };
  db.order_items.push(item);
  order.updated_at = at;
  return item;
}

function applyReview(db: DataSnapshot, order: Order, review: ReviewItemInput[]) {
  const items = itemsOf(db, order.id);
  for (const r of review) {
    const item = items.find((i) => i.id === r.item_id);
    if (!item) throw new DomainError("Review references an item that is not on this order.");
    assertNonNegInt(r.approved_quantity, `Approved quantity for ${item.requested_seed_name}`, true);
    if (r.seed_id && !db.seeds.some((s) => s.id === r.seed_id))
      throw new DomainError(`Inventory item for ${item.requested_seed_name} no longer exists.`);
  }
  for (const r of review) {
    const item = items.find((i) => i.id === r.item_id)!;
    item.seed_id = r.seed_id;
    item.unavailable = r.unavailable;
    item.approved_quantity = r.unavailable ? 0 : r.approved_quantity;
  }
}

/** Save review decisions without approving. Moves Received → Under Review. */
export function saveReview(db: DataSnapshot, orderId: string, review: ReviewItemInput[], at = iso()): Order {
  const order = getOrder(db, orderId);
  if (!REVIEWABLE_STATUSES.includes(order.status))
    throw new DomainError(`This order is ${order.status} and can no longer be edited.`, 409, "bad_status");
  applyReview(db, order, review);
  if (order.status === "Received") setStatus(db, order, "Under Review", "Review started", at);
  order.updated_at = at;
  return order;
}

export function startReview(db: DataSnapshot, orderId: string, at = iso()): Order {
  const order = getOrder(db, orderId);
  if (order.status !== "Received") throw new DomainError(`Order is already ${order.status}.`, 409, "bad_status");
  setStatus(db, order, "Under Review", "Review started", at);
  return order;
}

/**
 * Approve an order and reserve stock. All checks happen before any change,
 * so a failed approval leaves inventory untouched. Approving an order that is
 * already approved fails, so stock can never be reserved twice.
 */
export function approveOrder(db: DataSnapshot, orderId: string, review: ReviewItemInput[] | null, at = iso()): Order {
  const order = getOrder(db, orderId);
  if (RESERVING_STATUSES.includes(order.status) || order.status === "Delivered")
    throw new DomainError("This order has already been approved. Stock was not reserved again.", 409, "already_approved");
  if (order.status === "Cancelled") throw new DomainError("Cancelled orders cannot be approved.", 409, "bad_status");

  // Validate on a scratch copy of the items so a failure doesn't persist partial review edits.
  const items = itemsOf(db, orderId).map((i) => ({ ...i }));
  if (review) {
    for (const r of review) {
      const item = items.find((i) => i.id === r.item_id);
      if (!item) throw new DomainError("Review references an item that is not on this order.");
      assertNonNegInt(r.approved_quantity, `Approved quantity for ${item.requested_seed_name}`, true);
      item.seed_id = r.seed_id;
      item.unavailable = r.unavailable;
      item.approved_quantity = r.unavailable ? 0 : r.approved_quantity;
    }
  }

  const need = new Map<string, number>();
  for (const item of items) {
    if (item.unavailable) continue;
    if (item.approved_quantity === null)
      throw new DomainError(`Set an approved quantity for ${item.requested_seed_name}, or mark it unavailable.`);
    if (item.approved_quantity === 0) continue;
    if (!item.seed_id)
      throw new DomainError(`Inventory Match Required: choose the inventory item for "${item.requested_seed_name}".`, 409, "match_required");
    const seed = db.seeds.find((s) => s.id === item.seed_id);
    if (!seed) throw new DomainError(`Inventory item for ${item.requested_seed_name} no longer exists.`);
    if (seed.physical_quantity === null)
      throw new DomainError(`Stock Count Required: ${seedLabel(seed)} has not been counted yet, so it cannot be allocated.`, 409, "stock_count_required");
    need.set(seed.id, (need.get(seed.id) ?? 0) + item.approved_quantity);
  }
  if (need.size === 0) throw new DomainError("Approve at least one packet, or cancel the request instead.");

  for (const [seedId, qty] of need) {
    const seed = getSeed(db, seedId);
    const available = availableQuantity(seed)!;
    if (qty > available)
      throw new DomainError(
        `Insufficient stock for ${seedLabel(seed)}: ${qty} requested, only ${available} available (${seed.physical_quantity} on hand, ${seed.reserved_quantity} reserved).`,
        409,
        "insufficient_stock",
      );
  }

  // Commit.
  for (const scratch of items) {
    const real = db.order_items.find((i) => i.id === scratch.id)!;
    real.seed_id = scratch.seed_id;
    real.unavailable = scratch.unavailable;
    real.approved_quantity = scratch.unavailable ? 0 : scratch.approved_quantity;
  }
  for (const [seedId, qty] of need) {
    const seed = getSeed(db, seedId);
    seed.reserved_quantity += qty;
    seed.updated_at = at;
    recordMovement(db, seed, "reservation", qty, orderId, `Reserved for order #${order.order_number}`, at);
  }
  order.approved_at = at;
  setStatus(db, order, "Approved", "Approved and stock reserved", at);
  return order;
}

export function assignSteward(db: DataSnapshot, orderId: string, steward: string | null, at = iso()) {
  const order = getOrder(db, orderId);
  order.assigned_steward = steward?.trim() || null;
  order.updated_at = at;
  return order;
}

export function startPreparing(db: DataSnapshot, orderId: string, at = iso()): Order {
  const order = getOrder(db, orderId);
  if (order.status === "Preparing") return order;
  if (order.status !== "Approved")
    throw new DomainError(`Only approved orders can move to Preparing (this one is ${order.status}).`, 409, "bad_status");
  setStatus(db, order, "Preparing", "Packing started", at);
  return order;
}

export function packItems(db: DataSnapshot, orderId: string, packs: PackItemInput[], at = iso()): Order {
  const order = getOrder(db, orderId);
  if (order.status !== "Approved" && order.status !== "Preparing")
    throw new DomainError(`Packing can only be recorded for Approved or Preparing orders (this one is ${order.status}).`, 409, "bad_status");
  const items = itemsOf(db, orderId);
  for (const p of packs) {
    const item = items.find((i) => i.id === p.item_id);
    if (!item) throw new DomainError("Item not on this order.");
    assertNonNegInt(p.packed_quantity, "Packed quantity");
    if (p.packed_quantity > (item.approved_quantity ?? 0))
      throw new DomainError(`Cannot pack more than the ${item.approved_quantity ?? 0} approved for ${item.requested_seed_name}.`);
  }
  for (const p of packs) items.find((i) => i.id === p.item_id)!.packed_quantity = p.packed_quantity;
  if (order.status === "Approved") setStatus(db, order, "Preparing", "Packing started", at);
  order.updated_at = at;
  return order;
}

export function markReady(db: DataSnapshot, orderId: string, at = iso()): Order {
  const order = getOrder(db, orderId);
  if (order.status === "Ready") return order;
  if (order.status !== "Approved" && order.status !== "Preparing")
    throw new DomainError(`Only orders being packed can be marked Ready (this one is ${order.status}).`, 409, "bad_status");
  const missing = itemsOf(db, orderId).filter((i) => (i.approved_quantity ?? 0) > 0 && i.packed_quantity !== i.approved_quantity);
  if (missing.length)
    throw new DomainError(
      `Not all approved items are packed: ${missing.map((i) => `${i.requested_seed_name} (${i.packed_quantity}/${i.approved_quantity})`).join(", ")}.`,
      409,
      "not_packed",
    );
  order.ready_at = at;
  setStatus(db, order, "Ready", "All items packed", at);
  return order;
}

/** Deliver: deduct physical stock and release the reservation, exactly once. */
export function deliverOrder(db: DataSnapshot, orderId: string, at = iso()): Order {
  const order = getOrder(db, orderId);
  if (order.status === "Delivered")
    throw new DomainError("This order was already delivered. Stock was not deducted again.", 409, "already_delivered");
  if (order.status !== "Ready")
    throw new DomainError(`Only Ready orders can be delivered (this one is ${order.status}).`, 409, "bad_status");
  const allocations = itemsOf(db, orderId).filter((i) => (i.approved_quantity ?? 0) > 0 && i.seed_id);
  const bySeed = new Map<string, number>();
  for (const i of allocations) bySeed.set(i.seed_id!, (bySeed.get(i.seed_id!) ?? 0) + i.approved_quantity!);
  for (const [seedId, qty] of bySeed) {
    const seed = getSeed(db, seedId);
    if (seed.physical_quantity === null || seed.physical_quantity < qty || seed.reserved_quantity < qty)
      throw new DomainError(`Inventory for ${seedLabel(seed)} is inconsistent with this order's reservation.`, 409, "inconsistent");
  }
  for (const [seedId, qty] of bySeed) {
    const seed = getSeed(db, seedId);
    seed.physical_quantity! -= qty;
    seed.reserved_quantity -= qty;
    seed.updated_at = at;
    recordMovement(db, seed, "fulfillment", -qty, orderId, `Delivered order #${order.order_number}`, at);
  }
  order.delivered_at = at;
  setStatus(db, order, "Delivered", "Delivered; stock deducted", at);
  return order;
}

/** Cancel: release any reservation without touching physical stock. */
export function cancelOrder(db: DataSnapshot, orderId: string, reason: string | null = null, at = iso()): Order {
  const order = getOrder(db, orderId);
  if (order.status === "Cancelled") throw new DomainError("This order is already cancelled.", 409, "already_cancelled");
  if (order.status === "Delivered") throw new DomainError("Delivered orders cannot be cancelled.", 409, "bad_status");
  if (RESERVING_STATUSES.includes(order.status)) {
    const bySeed = new Map<string, number>();
    for (const i of itemsOf(db, orderId))
      if ((i.approved_quantity ?? 0) > 0 && i.seed_id) bySeed.set(i.seed_id, (bySeed.get(i.seed_id) ?? 0) + i.approved_quantity!);
    for (const [seedId, qty] of bySeed) {
      const seed = getSeed(db, seedId);
      seed.reserved_quantity = Math.max(0, seed.reserved_quantity - qty);
      seed.updated_at = at;
      recordMovement(db, seed, "release", -qty, orderId, `Released: order #${order.order_number} cancelled`, at);
    }
  }
  order.cancelled_at = at;
  setStatus(db, order, "Cancelled", reason || "Cancelled", at);
  return order;
}

// ---------- Delivery ----------

function validCoord(v: number | null | undefined, min: number, max: number, field: string) {
  if (v === null || v === undefined) return;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new DomainError(`${field} is out of range.`);
}

export function setDelivery(db: DataSnapshot, orderId: string, input: DeliveryInput, at = iso()): Order {
  const order = getOrder(db, orderId);
  if (input.delivery_method !== undefined && input.delivery_method !== null && !DELIVERY_METHODS.includes(input.delivery_method))
    throw new DomainError("Unknown delivery method.");
  validCoord(input.delivery_lat, -90, 90, "Latitude");
  validCoord(input.delivery_lng, -180, 180, "Longitude");
  const lat = input.delivery_lat !== undefined ? input.delivery_lat : order.delivery_lat;
  const lng = input.delivery_lng !== undefined ? input.delivery_lng : order.delivery_lng;
  if ((lat === null) !== (lng === null)) throw new DomainError("Provide both latitude and longitude, or neither.");
  if (input.delivery_method !== undefined) order.delivery_method = input.delivery_method;
  order.delivery_lat = lat;
  order.delivery_lng = lng;
  order.updated_at = at;
  return order;
}

// ---------- Bundles ----------

function validateBundle(db: DataSnapshot, input: BundleInput, selfId: string | null) {
  if (!input.name?.trim()) throw new DomainError("Bundle name is required.");
  const clash = db.bundles.find((b) => b.id !== selfId && norm(b.name) === norm(input.name));
  if (clash) throw new DomainError(`A bundle called "${clash.name}" already exists.`, 409, "duplicate");
  const seen = new Set<string>();
  for (const i of input.items) {
    if (!db.seeds.some((s) => s.id === i.seed_id)) throw new DomainError("A bundle item refers to a seed that no longer exists.");
    if (seen.has(i.seed_id)) throw new DomainError("Each seed can appear only once in a bundle.");
    seen.add(i.seed_id);
    assertNonNegInt(i.quantity, "Bundle quantity");
    if (i.quantity === 0) throw new DomainError("Bundle quantities must be at least 1.");
  }
}

export function saveBundle(db: DataSnapshot, id: string | null, input: BundleInput, at = iso()): Bundle {
  validateBundle(db, input, id);
  if (id) {
    const b = db.bundles.find((x) => x.id === id);
    if (!b) throw new DomainError("Bundle not found.", 404, "not_found");
    b.name = input.name.trim();
    b.description = input.description?.trim() || null;
    b.items = input.items.map((i) => ({ ...i }));
    b.updated_at = at;
    return b;
  }
  const b: Bundle = {
    id: uuid(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    items: input.items.map((i) => ({ ...i })),
    created_at: at,
    updated_at: at,
  };
  db.bundles.push(b);
  return b;
}

export function deleteBundle(db: DataSnapshot, id: string) {
  if (!db.bundles.some((b) => b.id === id)) throw new DomainError("Bundle not found.", 404, "not_found");
  db.bundles = db.bundles.filter((b) => b.id !== id);
}

/** Add a bundle's seeds to an order under review (skipping seeds already on it). Returns how many were added. */
export function addBundleItems(db: DataSnapshot, orderId: string, bundleId: string, at = iso()): number {
  const order = getOrder(db, orderId);
  if (!REVIEWABLE_STATUSES.includes(order.status))
    throw new DomainError("Items can only be added while the request is under review.", 409, "bad_status");
  const bundle = db.bundles.find((b) => b.id === bundleId);
  if (!bundle) throw new DomainError("Bundle not found.", 404, "not_found");
  const onOrder = new Set(itemsOf(db, orderId).map((i) => i.seed_id).filter(Boolean));
  let added = 0;
  for (const bi of bundle.items) {
    if (onOrder.has(bi.seed_id)) continue;
    const seed = db.seeds.find((s) => s.id === bi.seed_id);
    if (!seed) continue;
    db.order_items.push({
      id: uuid(),
      order_id: orderId,
      seed_id: seed.id,
      requested_seed_name: seedLabel(seed),
      requested_quantity: bi.quantity,
      approved_quantity: null,
      packed_quantity: 0,
      unavailable: false,
      created_at: at,
    });
    added++;
  }
  order.updated_at = at;
  return added;
}

// ---------- Settings & notifications ----------

export function defaultSettings(): AppSettings {
  return {
    notifications: {
      enabled: false,
      events: Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e, true])) as AppSettings["notifications"]["events"],
      staff_email: null,
    },
    allocation: { mode: "none", fixed: 2, students_per_packet: 10, min: 1, max: 5 },
    delivery: {
      depot_name: "YFS seed hub",
      depot_address: null,
      depot_lat: null,
      depot_lng: null,
      max_stops_per_trip: 8,
      avg_speed_kmh: 35,
      minutes_per_stop: 10,
      return_to_depot: true,
    },
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Merge and validate a partial settings update. */
export function updateSettings(db: DataSnapshot, patch: DeepPartial<AppSettings>): AppSettings {
  const next: AppSettings = structuredClone(db.settings);
  if (patch.notifications) {
    const n = patch.notifications;
    if (n.enabled !== undefined) next.notifications.enabled = Boolean(n.enabled);
    if (n.staff_email !== undefined) {
      const e = n.staff_email?.trim() || null;
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new DomainError("Staff email looks invalid.");
      next.notifications.staff_email = e;
    }
    if (n.events) for (const k of NOTIFICATION_EVENTS) if (n.events[k] !== undefined) next.notifications.events[k] = Boolean(n.events[k]);
  }
  if (patch.allocation) {
    const a = { ...next.allocation, ...patch.allocation };
    if (!["none", "fixed", "per_students"].includes(a.mode)) throw new DomainError("Unknown allocation mode.");
    for (const [k, v] of [["fixed", a.fixed], ["students_per_packet", a.students_per_packet], ["min", a.min], ["max", a.max]] as const) {
      assertNonNegInt(v, k.replace(/_/g, " "));
      if (v === 0 && k !== "min") throw new DomainError(`${k.replace(/_/g, " ")} must be at least 1.`);
    }
    if (a.min > a.max) throw new DomainError("Minimum can't be more than maximum.");
    next.allocation = a as AppSettings["allocation"];
  }
  if (patch.delivery) {
    const d = { ...next.delivery, ...patch.delivery };
    validCoord(d.depot_lat, -90, 90, "Depot latitude");
    validCoord(d.depot_lng, -180, 180, "Depot longitude");
    assertNonNegInt(d.max_stops_per_trip, "Max stops per trip");
    if (d.max_stops_per_trip < 1 || d.max_stops_per_trip > 25) throw new DomainError("Max stops per trip must be 1–25.");
    if (!(d.avg_speed_kmh > 0 && d.avg_speed_kmh <= 130)) throw new DomainError("Average speed must be between 1 and 130 km/h.");
    assertNonNegInt(d.minutes_per_stop, "Minutes per stop");
    d.depot_name = d.depot_name?.trim() || "Depot";
    d.depot_address = d.depot_address?.trim() || null;
    d.return_to_depot = Boolean(d.return_to_depot);
    next.delivery = d as AppSettings["delivery"];
  }
  db.settings = next;
  return next;
}

export function logNotification(db: DataSnapshot, entry: Omit<NotificationLogEntry, "id" | "created_at">, at = iso()) {
  const e: NotificationLogEntry = { ...entry, id: uuid(), created_at: at };
  db.notifications.unshift(e);
  if (db.notifications.length > 500) db.notifications.length = 500;
  return e;
}

/** Fill in fields added after a snapshot was first saved (older local demo files). */
export function normalizeSnapshot(db: DataSnapshot): DataSnapshot {
  const d = defaultSettings();
  const s = (db.settings ?? {}) as Partial<AppSettings>;
  db.settings = {
    notifications: { ...d.notifications, ...s.notifications, events: { ...d.notifications.events, ...s.notifications?.events } },
    allocation: { ...d.allocation, ...s.allocation },
    delivery: { ...d.delivery, ...s.delivery },
  };
  db.bundles ??= [];
  db.notifications ??= [];
  for (const o of db.orders) {
    o.delivery_method ??= null;
    o.delivery_lat ??= null;
    o.delivery_lng ??= null;
  }
  return db;
}

// ---------- Derived views ----------

export function inventorySummary(seeds: Seed[]) {
  const counted = seeds.filter((s) => s.physical_quantity !== null);
  return {
    varieties: seeds.length,
    counted: counted.length,
    uncounted: seeds.length - counted.length,
    physical: counted.reduce((a, s) => a + s.physical_quantity!, 0),
    reserved: counted.reduce((a, s) => a + s.reserved_quantity, 0),
    available: counted.reduce((a, s) => a + availableQuantity(s)!, 0),
    lowStock: seeds.filter((s) => {
      const st = stockStatus(s);
      return st === "Low Stock" || st === "Out of Stock";
    }).length,
  };
}

export function emptySnapshot(): DataSnapshot {
  return {
    seeds: [],
    orders: [],
    order_items: [],
    inventory_movements: [],
    order_status_history: [],
    settings: defaultSettings(),
    bundles: [],
    notifications: [],
    next_order_number: 1001,
  };
}
