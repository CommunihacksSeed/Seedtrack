/**
 * Cloudflare D1 store.
 *
 * D1 has no stored procedures, no row locks and no interactive transactions:
 * the only atomic unit is `db.batch()`, which can't branch on what it reads.
 * So all business rules stay in lib/domain.ts and every write is an optimistic
 * compare-and-swap:
 *
 *   1. Read the working tables and `store_meta.version` in one batch.
 *   2. Run the domain function on a copy. A rule violation throws here, before
 *      anything is written.
 *   3. Write only the rows that changed, in one batch whose first statement
 *      sets `version` to -1 if another writer got in first. That violates the
 *      store_meta_cas CHECK and rolls back the entire batch.
 *   4. On a conflict, start again from fresh data, so the rules are re-checked
 *      against the stock the other writer left behind.
 *
 * The schema's CHECK constraints remain a second safety net.
 */
import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types";
import * as domain from "../domain";
import { buildDemoSnapshot } from "../demo-data";
import type { AppSettings, DataSnapshot } from "../types";
import type { SeedFlowStore } from "./types";

type Row = Record<string, unknown>;
type Table = "seeds" | "orders" | "order_items" | "bundles" | "inventory_movements" | "order_status_history" | "notification_log";

const COLUMNS: Record<Table, readonly string[]> = {
  seeds: [
    "id", "name", "variety", "category", "description", "physical_quantity", "reserved_quantity",
    "unit", "storage_location", "low_stock_threshold", "created_at", "updated_at",
  ],
  orders: [
    "id", "order_number", "external_entry_id", "requester_name", "requester_email", "organization_name",
    "school_use", "mailing_address", "student_count", "requested_bundles", "special_requests",
    "garden_support", "seed_donation_interest", "assigned_steward", "status", "source", "submitted_at",
    "approved_at", "ready_at", "delivered_at", "cancelled_at", "created_at", "updated_at",
    "delivery_method", "delivery_lat", "delivery_lng",
  ],
  order_items: [
    "id", "order_id", "seed_id", "requested_seed_name", "requested_quantity", "approved_quantity",
    "packed_quantity", "unavailable", "created_at",
  ],
  bundles: ["id", "name", "description", "items", "created_at", "updated_at"],
  inventory_movements: [
    "id", "seed_id", "order_id", "movement_type", "quantity", "physical_after", "reserved_after",
    "notes", "created_at",
  ],
  order_status_history: ["id", "order_id", "previous_status", "new_status", "notes", "changed_at"],
  notification_log: ["id", "event", "order_id", "seed_id", "recipient", "subject", "body", "status", "error", "created_at"],
};

const SNAPSHOT_KEY: Record<Table, keyof DataSnapshot> = {
  seeds: "seeds",
  orders: "orders",
  order_items: "order_items",
  bundles: "bundles",
  inventory_movements: "inventory_movements",
  order_status_history: "order_status_history",
  notification_log: "notifications",
};

/** Parents first, so foreign keys hold while inserting. */
const INSERT_ORDER: Table[] = ["seeds", "orders", "order_items", "bundles", "inventory_movements", "order_status_history", "notification_log"];
const JSON_COLUMNS = new Set(["requested_bundles", "items"]);
const BOOLEANS = new Set(["school_use", "garden_support", "seed_donation_interest", "unavailable"]);
const MAX_ATTEMPTS = 12;

function toColumn(column: string, value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (BOOLEANS.has(column)) return value ? 1 : 0;
  if (JSON_COLUMNS.has(column)) return JSON.stringify(value);
  return value as string | number;
}

function fromRow<T>(row: Row): T {
  const out: Row = { ...row };
  for (const column of BOOLEANS) if (column in out && out[column] !== null) out[column] = out[column] === 1;
  for (const column of JSON_COLUMNS) if (column in out) out[column] = JSON.parse(out[column] as string);
  return out as T;
}

function rows<T>(result: D1Result<unknown>): T[] {
  return (result.results as Row[]).map((r) => fromRow<T>(r));
}

function insertStatement(db: D1Database, table: Table, row: Row) {
  const columns = COLUMNS[table];
  return db
    .prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
    .bind(...columns.map((c) => toColumn(c, row[c])));
}

const saveSettings = (db: D1Database, settings: AppSettings) =>
  db.prepare("UPDATE app_settings SET value = ? WHERE id = 1").bind(JSON.stringify(settings));

const settingsOf = (result: D1Result<unknown>) =>
  JSON.parse((result.results as { value: string }[])[0].value) as AppSettings;

/** INSERT, UPDATE and DELETE statements that turn `before` into `after`. */
function diff(db: D1Database, before: DataSnapshot, after: DataSnapshot) {
  const inserts: D1PreparedStatement[] = [];
  const updates: D1PreparedStatement[] = [];
  const deletes: D1PreparedStatement[] = [];
  for (const table of INSERT_ORDER) {
    const old = new Map((before[SNAPSHOT_KEY[table]] as unknown as Row[]).map((r) => [r.id as string, r]));
    const current = after[SNAPSHOT_KEY[table]] as unknown as Row[];
    for (const row of current) {
      const prev = old.get(row.id as string);
      if (!prev) {
        inserts.push(insertStatement(db, table, row));
        continue;
      }
      const changed = COLUMNS[table].filter((c) => toColumn(c, row[c]) !== toColumn(c, prev[c]));
      if (changed.length)
        updates.push(
          db
            .prepare(`UPDATE ${table} SET ${changed.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`)
            .bind(...changed.map((c) => toColumn(c, row[c])), row.id),
        );
    }
    const kept = new Set(current.map((r) => r.id));
    // Children go first. History isn't loaded for writes, and ON DELETE CASCADE covers it.
    for (const id of old.keys())
      if (!kept.has(id)) deletes.unshift(db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id));
  }
  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) updates.push(saveSettings(db, after.settings));
  return [...inserts, ...updates, ...deletes];
}

const compareAndSwap = (db: D1Database, version: number, nextOrderNumber: number) =>
  db
    .prepare(
      "UPDATE store_meta SET version = CASE WHEN version = ? THEN version + 1 ELSE -1 END, next_order_number = ? WHERE id = 1",
    )
    .bind(version, nextOrderNumber);

const isConflict = (e: unknown) => e instanceof Error && e.message.includes("store_meta_cas");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The tables domain rules read. They only ever append to the audit logs and notification log. */
async function loadWorking(db: D1Database) {
  const [meta, seeds, orders, items, bundles, settings] = await db.batch([
    db.prepare("SELECT version, next_order_number FROM store_meta WHERE id = 1"),
    db.prepare("SELECT * FROM seeds"),
    db.prepare("SELECT * FROM orders"),
    db.prepare("SELECT * FROM order_items ORDER BY created_at"),
    db.prepare("SELECT * FROM bundles"),
    db.prepare("SELECT value FROM app_settings WHERE id = 1"),
  ]);
  const { version, next_order_number } = (meta.results as { version: number; next_order_number: number }[])[0];
  const snapshot = domain.normalizeSnapshot({
    seeds: rows(seeds),
    orders: rows(orders),
    order_items: rows(items),
    inventory_movements: [],
    order_status_history: [],
    next_order_number,
    settings: settingsOf(settings),
    bundles: rows(bundles),
    notifications: [],
  });
  return { version, snapshot };
}

async function replaceAll(db: D1Database, next: DataSnapshot) {
  const { version } = await loadWorking(db);
  const statements = [
    compareAndSwap(db, version, next.next_order_number),
    ...[...INSERT_ORDER].reverse().map((table) => db.prepare(`DELETE FROM ${table}`)),
    ...INSERT_ORDER.flatMap((table) => (next[SNAPSHOT_KEY[table]] as unknown as Row[]).map((row) => insertStatement(db, table, row))),
    saveSettings(db, next.settings),
  ];
  await db.batch(statements);
}

export function createD1Store(db: D1Database): SeedFlowStore {
  async function transact<T>(fn: (draft: DataSnapshot) => T): Promise<T> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { version, snapshot } = await loadWorking(db);
      const draft = structuredClone(snapshot);
      const result = fn(draft);
      const changes = diff(db, snapshot, draft);
      if (changes.length === 0) return result;
      try {
        await db.batch([compareAndSwap(db, version, draft.next_order_number), ...changes]);
        return result;
      } catch (e) {
        if (!isConflict(e)) throw e;
        await wait(Math.random() * 25 * (attempt + 1));
      }
    }
    throw new domain.DomainError("The system is busy with other changes. Please try again.", 503, "busy");
  }

  return {
    mode: "d1",
    transact,
    async version() {
      const row = await db.prepare("SELECT version FROM store_meta WHERE id = 1").first<{ version: number }>();
      return row!.version;
    },
    async snapshot() {
      const [seeds, orders, items, moves, history, meta, bundles, notifications, settings] = await db.batch([
        db.prepare("SELECT * FROM seeds ORDER BY name"),
        db.prepare("SELECT * FROM orders ORDER BY submitted_at DESC"),
        db.prepare("SELECT * FROM order_items ORDER BY created_at"),
        db.prepare("SELECT * FROM inventory_movements ORDER BY created_at DESC LIMIT 2000"),
        db.prepare("SELECT * FROM order_status_history ORDER BY changed_at DESC LIMIT 2000"),
        db.prepare("SELECT next_order_number FROM store_meta WHERE id = 1"),
        db.prepare("SELECT * FROM bundles ORDER BY name"),
        db.prepare("SELECT * FROM notification_log ORDER BY created_at DESC LIMIT 200"),
        db.prepare("SELECT value FROM app_settings WHERE id = 1"),
      ]);
      return domain.normalizeSnapshot({
        seeds: rows(seeds),
        orders: rows(orders),
        order_items: rows(items),
        inventory_movements: rows(moves),
        order_status_history: rows(history),
        next_order_number: (meta.results as { next_order_number: number }[])[0].next_order_number,
        settings: settingsOf(settings),
        bundles: rows(bundles),
        notifications: rows(notifications),
      });
    },
    createSeed: (input) => transact((s) => domain.createSeed(s, input)),
    updateSeed: (id, input) => transact((s) => domain.updateSeedDetails(s, id, input)),
    setStockCount: (id, q, notes) => transact((s) => domain.setStockCount(s, id, q, notes)),
    deleteSeed: (id) => transact((s) => domain.deleteSeed(s, id)),
    createOrder: (input) => transact((s) => domain.createOrder(s, input)),
    addOrderItem: (id, name) => transact((s) => domain.addOrderItem(s, id, name)),
    startReview: (id) => transact((s) => domain.startReview(s, id)),
    saveReview: (id, r) => transact((s) => domain.saveReview(s, id, r)),
    approveOrder: (id, r) => transact((s) => domain.approveOrder(s, id, r)),
    assignSteward: (id, x) => transact((s) => domain.assignSteward(s, id, x)),
    startPreparing: (id) => transact((s) => domain.startPreparing(s, id)),
    packItems: (id, p) => transact((s) => domain.packItems(s, id, p)),
    markReady: (id) => transact((s) => domain.markReady(s, id)),
    deliverOrder: (id) => transact((s) => domain.deliverOrder(s, id)),
    cancelOrder: (id, reason) => transact((s) => domain.cancelOrder(s, id, reason)),
    setDelivery: (id, input) => transact((s) => domain.setDelivery(s, id, input)),
    addBundleItems: (id, bundleId) => transact((s) => domain.addBundleItems(s, id, bundleId)),
    updateSettings: (patch) => transact((s) => domain.updateSettings(s, patch)),
    saveBundle: (id, input) => transact((s) => domain.saveBundle(s, id, input)),
    deleteBundle: (id) => transact((s) => domain.deleteBundle(s, id)),
    logNotification: (entry) => transact((s) => void domain.logNotification(s, entry)),
    resetDemo: () => replaceAll(db, buildDemoSnapshot()),
  };
}
