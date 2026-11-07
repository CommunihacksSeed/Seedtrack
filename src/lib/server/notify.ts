import "server-only";
import { after } from "next/server";
import { availableQuantity, seedLabel, stockStatus } from "../domain";
import type { SeedFlowStore } from "../store/types";
import {
  DELIVERY_LABELS,
  NOTIFICATION_EVENT_INFO,
  type DataSnapshot,
  type NotificationEvent,
  type Order,
  type Seed,
} from "../types";

/**
 * Notifications are OFF by default; staff turn them on (and pick events) in
 * Settings. Every notification is written to the notification log. Emails are
 * actually sent only when an email service is configured (RESEND_API_KEY +
 * NOTIFY_FROM_EMAIL); otherwise entries are logged as "logged" so staff can see
 * what would have gone out.
 */
export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM_EMAIL);
}

type Message = { recipient: string | null; subject: string; body: string };
const SIGN_OFF = "\n\n— Youth in Food Systems (Seeds of Diversity Canada)";

function itemsList(db: DataSnapshot, order: Order) {
  const seeds = new Map(db.seeds.map((s) => [s.id, s]));
  return db.order_items
    .filter((i) => i.order_id === order.id && (i.approved_quantity ?? 0) > 0)
    .map((i) => {
      const s = i.seed_id ? seeds.get(i.seed_id) : undefined;
      return `  • ${s ? seedLabel(s) : i.requested_seed_name}: ${i.approved_quantity} ${s?.unit ?? "packets"}`;
    })
    .join("\n");
}

function compose(event: NotificationEvent, db: DataSnapshot, order?: Order, seed?: Seed): Message {
  const staff = db.settings.notifications.staff_email;
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const link = (path: string) => (appUrl ? `\n\nOpen in SeedFlow: ${appUrl}${path}` : "");
  switch (event) {
    case "request_received": {
      const n = db.order_items.filter((i) => i.order_id === order!.id).length;
      return {
        recipient: staff,
        subject: `New seed request #${order!.order_number} — ${order!.organization_name}`,
        body:
          `A new seed request is waiting for review.\n\nOrder #${order!.order_number}\nFrom: ${order!.organization_name}\n` +
          `Varieties: ${n}${order!.requested_bundles.length ? `\nBundles: ${order!.requested_bundles.join(", ")}` : ""}\nSource: ${order!.source}` +
          link(`/requests/${order!.id}`),
      };
    }
    case "order_approved":
      return {
        recipient: order!.requester_email,
        subject: `Your seed request #${order!.order_number} has been approved`,
        body:
          `Hi ${order!.requester_name},\n\nGood news! Your seed request for ${order!.organization_name} has been approved. Here's what we're preparing:\n\n` +
          `${itemsList(db, order!)}\n\nWe'll let you know when it's packed.${SIGN_OFF}`,
      };
    case "order_ready": {
      const how =
        order!.delivery_method === "pickup"
          ? "It's ready for pickup."
          : order!.delivery_method === "mail"
            ? "It will be mailed to you shortly."
            : "It will be delivered to you shortly.";
      return {
        recipient: order!.requester_email,
        subject: `Your seeds are packed (order #${order!.order_number})`,
        body: `Hi ${order!.requester_name},\n\nYour seed order for ${order!.organization_name} has been packed. ${how}\n\n${itemsList(db, order!)}${SIGN_OFF}`,
      };
    }
    case "order_delivered":
      return {
        recipient: order!.requester_email,
        subject: `Your seeds have been ${order!.delivery_method === "mail" ? "sent" : "delivered"} (order #${order!.order_number})`,
        body:
          `Hi ${order!.requester_name},\n\nYour seed order for ${order!.organization_name} has been ${order!.delivery_method === "mail" ? "sent" : "delivered"}` +
          `${order!.delivery_method ? ` (${DELIVERY_LABELS[order!.delivery_method].toLowerCase()})` : ""}. Happy growing! 🌱${SIGN_OFF}`,
      };
    case "low_stock": {
      const avail = availableQuantity(seed!);
      return {
        recipient: staff,
        subject: `${stockStatus(seed!)}: ${seedLabel(seed!)}`,
        body:
          `${seedLabel(seed!)} is ${stockStatus(seed!).toLowerCase()}: ${avail} ${seed!.unit} available ` +
          `(${seed!.physical_quantity} on hand, ${seed!.reserved_quantity} reserved; alert threshold ${seed!.low_stock_threshold ?? "—"}).` +
          link("/inventory"),
      };
    }
  }
}

async function sendEmail(to: string, subject: string, text: string) {
  // Resend's documented REST endpoint. Only called when RESEND_API_KEY is set.
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.NOTIFY_FROM_EMAIL, to: [to], subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Email service responded ${res.status}`);
}

/** Compose, (maybe) send, and log one notification. Respects the on/off settings unless forced. */
export async function deliverNotification(
  store: SeedFlowStore,
  event: NotificationEvent,
  ctx: { orderId?: string; seedId?: string },
  opts: { force?: boolean } = {},
) {
  const db = await store.snapshot();
  const settings = db.settings.notifications;
  if (!opts.force && (!settings.enabled || !settings.events[event])) return null;
  const order = ctx.orderId ? db.orders.find((o) => o.id === ctx.orderId) : undefined;
  const seed = ctx.seedId ? db.seeds.find((s) => s.id === ctx.seedId) : undefined;
  if ((ctx.orderId && !order) || (ctx.seedId && !seed)) return null;
  const msg = compose(event, db, order, seed);
  let status: "sent" | "logged" | "skipped" | "failed" = "logged";
  let error: string | null = null;
  if (!msg.recipient) {
    status = "skipped";
    error = NOTIFICATION_EVENT_INFO[event].to === "staff" ? "No staff email set" : "Requester has no email";
  } else if (emailConfigured()) {
    try {
      await sendEmail(msg.recipient, msg.subject, msg.body);
      status = "sent";
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message : "Send failed";
    }
  }
  const entry = {
    event,
    order_id: order?.id ?? null,
    seed_id: seed?.id ?? null,
    recipient: msg.recipient,
    subject: msg.subject,
    body: msg.body,
    status,
    error,
  };
  await store.logNotification(entry);
  return entry;
}

/** Fire-and-forget after the HTTP response is sent. */
export function notifyLater(store: SeedFlowStore, event: NotificationEvent, ctx: { orderId?: string; seedId?: string }) {
  after(() => deliverNotification(store, event, ctx).catch((e) => console.error("notification failed", e)));
}

/** Snapshot the stock status of some seeds, run fn, then notify for seeds that newly became low/out of stock. */
export async function withLowStockCheck<T>(store: SeedFlowStore, seedIds: () => Promise<string[]>, fn: () => Promise<T>): Promise<T> {
  const ids = await seedIds();
  const before = new Map((await store.snapshot()).seeds.filter((s) => ids.includes(s.id)).map((s) => [s.id, stockStatus(s)]));
  const result = await fn();
  const after = (await store.snapshot()).seeds.filter((s) => ids.includes(s.id));
  for (const s of after) {
    const now = stockStatus(s);
    const was = before.get(s.id);
    const bad = now === "Low Stock" || now === "Out of Stock";
    if (bad && was !== now && !(was === "Out of Stock" && now === "Low Stock")) notifyLater(store, "low_stock", { seedId: s.id });
  }
  return result;
}
