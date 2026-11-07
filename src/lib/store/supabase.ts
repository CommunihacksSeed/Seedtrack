/**
 * Supabase store. Server-side only: it uses the service role key, which must
 * never be sent to the browser. Every inventory-changing operation is a single
 * call to a transactional SQL function (supabase/migrations/0002_functions.sql).
 */
import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as domain from "../domain";
import { DomainError } from "../domain";
import { buildDemoSnapshot } from "../demo-data";
import type { AppSettings, Bundle, DataSnapshot, NotificationLogEntry, Order, OrderItem, Seed } from "../types";
import type { SeedFlowStore } from "./types";

const HINT_STATUS: Record<string, number> = { not_found: 404, invalid: 400 };

function client(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type PgError = { message: string; hint?: string | null; code?: string } | null;

function check<T>(data: T, error: PgError): T {
  if (error) {
    if (error.hint && /^[a-z_]+$/.test(error.hint))
      throw new DomainError(error.message, HINT_STATUS[error.hint] ?? 409, error.hint);
    console.error("Supabase error", error);
    throw new Error("Database error. Check server logs.");
  }
  return data;
}

async function rpc<T>(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  return check(data as T, error);
}

async function getOrder(sb: SupabaseClient, id: string): Promise<Order> {
  const { data, error } = await sb.from("orders").select("*").eq("id", id).single();
  return check(data as Order, error);
}

export function createSupabaseStore(): SeedFlowStore {
  const sb = client();
  return {
    mode: "supabase",
    async snapshot() {
      const [seeds, orders, items, moves, hist, settings, bundles, notes] = await Promise.all([
        sb.from("seeds").select("*").order("name"),
        sb.from("orders").select("*").order("submitted_at", { ascending: false }),
        sb.from("order_items").select("*").order("created_at"),
        sb.from("inventory_movements").select("*").order("created_at", { ascending: false }).limit(2000),
        sb.from("order_status_history").select("*").order("changed_at", { ascending: false }).limit(2000),
        sb.from("app_settings").select("value").eq("id", 1).maybeSingle(),
        sb.from("bundles").select("*").order("name"),
        sb.from("notification_log").select("*").order("created_at", { ascending: false }).limit(200),
      ]);
      const snap: DataSnapshot = {
        seeds: check(seeds.data as Seed[], seeds.error),
        orders: check(orders.data as Order[], orders.error),
        order_items: check(items.data as OrderItem[], items.error),
        inventory_movements: check(moves.data ?? [], moves.error),
        order_status_history: check(hist.data ?? [], hist.error),
        settings: (check(settings.data, settings.error)?.value ?? {}) as AppSettings,
        bundles: check(bundles.data as Bundle[], bundles.error) ?? [],
        notifications: check(notes.data as NotificationLogEntry[], notes.error) ?? [],
        next_order_number: 0,
      };
      return domain.normalizeSnapshot(snap);
    },
    createSeed: (input) => rpc<Seed>(sb, "sf_create_seed", { p: input }),
    async updateSeed(id, input) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ["name", "variety", "category", "description", "unit", "storage_location", "low_stock_threshold"] as const)
        if (input[k] !== undefined) patch[k] = typeof input[k] === "string" ? (input[k] as string).trim() || null : input[k];
      if (patch.name === null) throw new DomainError("Seed name is required.");
      if (patch.unit === null) patch.unit = "packets";
      const { data, error } = await sb.from("seeds").update(patch).eq("id", id).select().single();
      return check(data as Seed, error);
    },
    setStockCount: (id, q, notes) => rpc<Seed>(sb, "sf_set_stock", { p_seed_id: id, p_physical: q, p_notes: notes }),
    deleteSeed: (id) => rpc<void>(sb, "sf_delete_seed", { p_seed_id: id }),
    async createOrder(input) {
      const r = await rpc<{ order_id: string; duplicate: boolean }>(sb, "sf_create_order", { p: input });
      return { order: await getOrder(sb, r.order_id), duplicate: r.duplicate };
    },
    addOrderItem: (id, name) => rpc<OrderItem>(sb, "sf_add_item", { p_order_id: id, p_name: name }),
    startReview: (id) => rpc<Order>(sb, "sf_start_review", { p_order_id: id }),
    saveReview: (id, review) => rpc<Order>(sb, "sf_save_review", { p_order_id: id, p_review: review }),
    approveOrder: (id, review) => rpc<Order>(sb, "sf_approve_order", { p_order_id: id, p_review: review }),
    async assignSteward(id, steward) {
      const { data, error } = await sb
        .from("orders")
        .update({ assigned_steward: steward?.trim() || null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      return check(data as Order, error);
    },
    startPreparing: (id) => rpc<Order>(sb, "sf_start_preparing", { p_order_id: id }),
    packItems: (id, packs) => rpc<Order>(sb, "sf_pack_items", { p_order_id: id, p_packs: packs }),
    markReady: (id) => rpc<Order>(sb, "sf_mark_ready", { p_order_id: id }),
    deliverOrder: (id) => rpc<Order>(sb, "sf_deliver_order", { p_order_id: id }),
    cancelOrder: (id, reason) => rpc<Order>(sb, "sf_cancel_order", { p_order_id: id, p_reason: reason }),
    async setDelivery(id, input) {
      // Validate with the shared rules, then write the delivery fields only.
      const current = await getOrder(sb, id);
      const scratch = { ...domain.emptySnapshot(), orders: [{ ...current }] };
      const o = domain.setDelivery(scratch, id, input);
      const { data, error } = await sb
        .from("orders")
        .update({ delivery_method: o.delivery_method, delivery_lat: o.delivery_lat, delivery_lng: o.delivery_lng, updated_at: o.updated_at })
        .eq("id", id)
        .select()
        .single();
      return check(data as Order, error);
    },
    addBundleItems: (id, bundleId) => rpc<number>(sb, "sf_add_bundle_items", { p_order_id: id, p_bundle_id: bundleId }),
    async updateSettings(patch) {
      const snap = domain.normalizeSnapshot({ ...domain.emptySnapshot(), settings: (await this.snapshot()).settings });
      const next = domain.updateSettings(snap, patch);
      const { error } = await sb.from("app_settings").upsert({ id: 1, value: next, updated_at: new Date().toISOString() });
      check(null, error);
      return next;
    },
    async saveBundle(id, input) {
      const [seeds, bundles] = await Promise.all([sb.from("seeds").select("*"), sb.from("bundles").select("*")]);
      const scratch = { ...domain.emptySnapshot(), seeds: check(seeds.data as Seed[], seeds.error), bundles: check(bundles.data as Bundle[], bundles.error) };
      const b = domain.saveBundle(scratch, id, input);
      const row = { name: b.name, description: b.description, items: b.items, updated_at: b.updated_at };
      const res = id
        ? await sb.from("bundles").update(row).eq("id", id).select().single()
        : await sb.from("bundles").insert({ ...row, id: b.id, created_at: b.created_at }).select().single();
      return check(res.data as Bundle, res.error);
    },
    async deleteBundle(id) {
      const { error } = await sb.from("bundles").delete().eq("id", id);
      check(null, error);
    },
    async logNotification(entry) {
      const { error } = await sb.from("notification_log").insert(entry);
      check(null, error);
    },
    resetDemo: () => rpc<void>(sb, "sf_reset_demo", { p: buildDemoSnapshot(), p_confirm: "RESET" }),
  };
}
