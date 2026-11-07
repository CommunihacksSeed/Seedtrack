import { z } from "zod";
import { getStore } from "@/lib/store";
import { DomainError, seedLabel } from "@/lib/domain";
import { errorResponse, json, parseBody } from "@/lib/server/http";
import { notifyLater } from "@/lib/server/notify";

/**
 * Public seed request form submissions (/request). No login, so it is kept
 * narrow: requests are created as "Received" for staff to review, seeds must
 * be ones in the inventory (names come from the database, not the browser),
 * text and list sizes are capped, a hidden honeypot field catches simple bots,
 * and each IP can submit a few times per 10 minutes (best effort, per worker).
 */
const qty = z.number().int().min(0).max(1000);
const text = (max: number) => z.string().trim().max(max);
const schema = z.object({
  requester_name: text(200).min(1, "Please enter your name"),
  requester_email: z.union([z.string().trim().email("That email doesn’t look right").max(200), z.literal("")]).nullish(),
  organization_name: text(300).min(1, "Please enter your school or organization"),
  school_use: z.boolean().nullish(),
  mailing_address: text(500).nullish(),
  student_count: z.number().int().min(0).max(100000).nullish(),
  requested_bundles: z.array(text(100)).max(20).optional(),
  special_requests: text(2000).nullish(),
  garden_support: z.boolean().nullish(),
  seed_donation_interest: z.boolean().nullish(),
  items: z.array(z.object({ seed_id: z.string().uuid(), requested_quantity: qty.nullish() })).max(100),
  website: z.string().max(500).optional(),
});

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return true;
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

export async function POST(req: Request) {
  try {
    // Cloudflare always sets cf-connecting-ip in production. Without a known IP we
    // don't limit at all, rather than lumping every visitor into one shared bucket.
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (ip && rateLimited(ip)) return json({ error: "Too many requests from this connection. Please wait a few minutes and try again." }, 429);
    const body = await parseBody(req, schema);
    // Honeypot filled in: pretend it worked, store nothing.
    if (body.website) return json({ ok: true, order_number: null });

    const store = getStore();
    const db = await store.snapshot();
    const seeds = new Map(db.seeds.map((s) => [s.id, s]));
    const bundleNames = new Set(db.bundles.map((b) => b.name));
    const unknown = body.items.find((i) => !seeds.has(i.seed_id));
    if (unknown) throw new DomainError("One of the chosen seeds is no longer available. Please reload the form.");
    const bundles = [...new Set(body.requested_bundles ?? [])].filter((b) => bundleNames.has(b));
    const seen = new Set<string>();
    const items = body.items
      .filter((i) => !seen.has(i.seed_id) && seen.add(i.seed_id))
      .map((i) => ({ seed_id: i.seed_id, requested_seed_name: seedLabel(seeds.get(i.seed_id)!), requested_quantity: i.requested_quantity ?? null }));

    const { order } = await store.createOrder({
      requester_name: body.requester_name,
      requester_email: body.requester_email || null,
      organization_name: body.organization_name,
      school_use: body.school_use ?? null,
      mailing_address: body.mailing_address || null,
      student_count: body.student_count ?? null,
      requested_bundles: bundles,
      special_requests: body.special_requests || null,
      garden_support: body.garden_support ?? null,
      seed_donation_interest: body.seed_donation_interest ?? null,
      source: "public-form",
      items,
    });
    notifyLater(store, "request_received", { orderId: order.id });
    // Only the confirmation number goes back: nothing else about stored requests.
    return json({ ok: true, order_number: order.order_number });
  } catch (e) {
    return errorResponse(e);
  }
}
