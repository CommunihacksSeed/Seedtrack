"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, ArrowLeft, Ban, Boxes, CheckCircle2, ExternalLink, Mail, MapPin, Package, Plus, Printer, Save, Truck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useData } from "@/components/data-provider";
import { ActionMenu, Badge, Button, EmptyState, LinkButton, Modal, StatusBadge, fmtDate, fmtNum, inputCls, type MenuItem } from "@/components/ui";
import { availableQuantity, seedLabel } from "@/lib/domain";
import { suggestQuantity } from "@/lib/allocation";
import { REVIEWABLE_STATUSES, RESERVING_STATUSES, type Order, type OrderItem, type Seed } from "@/lib/types";

type Row = { item: OrderItem; seedId: string; qty: string; unavailable: boolean; suggested: boolean };

/**
 * Review and fulfilment view for one request. Used both as the full request
 * page and as the detail panel beside the request list. All actions call the
 * same /api/orders/:id endpoint as before.
 */
export function RequestReview({ orderId, variant, onBack }: { orderId: string; variant: "page" | "panel"; onBack?: () => void }) {
  const { state } = useData();
  const order = state!.snapshot.orders.find((o) => o.id === orderId);
  if (!order)
    return (
      <EmptyState title="Request not found" action={<LinkButton href="/requests">Back to requests</LinkButton>}>
        It may have been removed, or the link is out of date.
      </EmptyState>
    );
  const items = state!.snapshot.order_items.filter((i) => i.order_id === orderId);
  // Reset the review draft only when saved items or the status change (not e.g. the delivery method).
  const draftKey = order.id + order.status + items.map((i) => `${i.id}:${i.seed_id}:${i.approved_quantity}:${i.unavailable}`).join("|");
  return <Review key={draftKey} order={order} items={items} variant={variant} onBack={onBack} />;
}

function Review({ order, items, variant, onBack }: { order: Order; items: OrderItem[]; variant: "page" | "panel"; onBack?: () => void }) {
  const { state, mutate, toast } = useData();
  const router = useRouter();
  const db = state!.snapshot;
  const seeds = db.seeds;
  const seedById = useMemo(() => new Map(seeds.map((s) => [s.id, s])), [seeds]);
  const reviewable = REVIEWABLE_STATUSES.includes(order.status);
  const rule = db.settings.allocation;
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((item) => {
      // Proposal order: saved decision → what they asked for → the suggestion rule (if on) → blank.
      const suggestion = item.approved_quantity === null && item.requested_quantity === null ? suggestQuantity(rule, order.student_count) : null;
      return {
        item,
        seedId: item.seed_id ?? "",
        qty: item.approved_quantity?.toString() ?? item.requested_quantity?.toString() ?? suggestion?.toString() ?? "",
        unavailable: item.unavailable,
        suggested: suggestion !== null,
      };
    }),
  );
  const [busy, setBusy] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const update = (idx: number, patch: Partial<Row>) =>
    setRows((r) => r.map((x, i) => (i === idx ? { ...x, ...patch, suggested: "qty" in patch ? false : x.suggested } : x)));
  const norm = (s: string) => s.trim().toLowerCase();
  const requestedBundles = order.requested_bundles.map((name) => ({ name, template: db.bundles.find((b) => norm(b.name) === norm(name)) }));
  const otherBundles = db.bundles.filter((b) => !requestedBundles.some((r) => r.template?.id === b.id));

  // Live per-row checks, plus combined demand per seed (two rows can draw on the same seed).
  const demand = new Map<string, number>();
  for (const r of rows) if (!r.unavailable && r.seedId && /^\d+$/.test(r.qty)) demand.set(r.seedId, (demand.get(r.seedId) ?? 0) + Number(r.qty));
  const checks = rows.map((r) => {
    const seed = r.seedId ? seedById.get(r.seedId) : undefined;
    const issues: { tone: "amber" | "red"; text: string }[] = [];
    if (r.unavailable) return { seed, issues };
    if (r.qty !== "" && !/^\d+$/.test(r.qty)) issues.push({ tone: "red", text: "Whole number required" });
    const qty = /^\d+$/.test(r.qty) ? Number(r.qty) : null;
    if (qty === null && r.qty === "") issues.push({ tone: "amber", text: "Approved quantity needed" });
    if (qty !== 0) {
      if (!seed) issues.push({ tone: "amber", text: "Inventory match required" });
      else if (seed.physical_quantity === null) issues.push({ tone: "amber", text: "Stock count required" });
      else if ((demand.get(seed.id) ?? 0) > availableQuantity(seed)!) issues.push({ tone: "red", text: `Only ${availableQuantity(seed)} available` });
    }
    return { seed, issues };
  });
  const blocking = checks.some((c) => c.issues.length > 0);
  const issueCount = checks.reduce((a, c) => a + (c.issues.length ? 1 : 0), 0);
  const totalApproved = rows.reduce((a, r) => a + (!r.unavailable && /^\d+$/.test(r.qty) ? Number(r.qty) : 0), 0);

  const reviewPayload = () =>
    rows.map((r) => ({
      item_id: r.item.id,
      seed_id: r.seedId || null,
      approved_quantity: r.unavailable ? 0 : r.qty === "" ? null : Number(r.qty),
      unavailable: r.unavailable,
    }));

  async function act(body: unknown, success: string) {
    setBusy(true);
    try {
      await mutate(`/api/orders/${order.id}`, body);
      toast(success);
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const history = db.order_status_history.filter((h) => h.order_id === order.id).sort((a, b) => a.changed_at.localeCompare(b.changed_at));
  const open = order.status !== "Delivered" && order.status !== "Cancelled";
  const reserving = RESERVING_STATUSES.includes(order.status);
  const menu: MenuItem[] = [
    ...(variant === "panel" ? [{ label: "Open full page", icon: <ExternalLink />, onSelect: () => router.push(`/requests/${order.id}`) }] : []),
    ...(reserving
      ? [
          { label: "Print packing list", icon: <Printer />, onSelect: () => router.push(`/packing/${order.id}/print`) },
          { label: "Go to packing queue", icon: <Package />, onSelect: () => router.push("/packing") },
        ]
      : []),
    ...(open ? [{ label: "Cancel request", icon: <Ban />, danger: true, onSelect: () => setCancelOpen(true) }] : []),
  ];

  return (
    <div className="space-y-4">
      {variant === "page" && (
        <Link
          href="/requests"
          className="no-print inline-flex min-h-8 items-center gap-1 text-sm text-muted hover:text-forest-700"
          onClick={(e) => {
            // Go back to the exact list (view, group, search) the person came from.
            if (window.history.length > 1) {
              e.preventDefault();
              router.back();
            }
          }}
        >
          <ArrowLeft size={14} /> Seed Requests
        </Link>
      )}
      {variant === "panel" && onBack && (
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted hover:text-forest-700">
          <ArrowLeft size={14} /> All requests
        </button>
      )}

      {/* Header: identity on the left, the next workflow step on the right. */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={clsx("font-display font-semibold leading-tight text-forest-900", variant === "page" ? "text-[1.75rem]" : "text-2xl")}>
              Order #{order.order_number}
            </h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            <span className="font-medium text-forest-900">{order.organization_name}</span> · {order.requester_name} · submitted {fmtDate(order.submitted_at)}
          </p>
        </div>
        <div className="no-print flex shrink-0 items-center gap-2">
          {order.status === "Received" && (
            <Button onClick={() => act({ action: "start_review" }, "Review started")} disabled={busy}>
              Start review
            </Button>
          )}
          {reserving && order.status !== "Ready" && (
            <LinkButton href="/packing" variant="primary">
              <Package /> Pack this order
            </LinkButton>
          )}
          {order.status === "Ready" && (
            <Button variant="primary" onClick={() => act({ action: "deliver" }, `Order #${order.order_number} delivered.`)} disabled={busy}>
              <Truck /> Mark delivered
            </Button>
          )}
          {menu.length > 0 && <ActionMenu label={`More actions for order #${order.order_number}`} items={menu} size="md" />}
        </div>
      </header>

      <div className={clsx("grid gap-4", variant === "page" && "2xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <section aria-label="Requested seeds" className="min-w-0 rounded-lg border border-sage-200 bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sage-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-forest-900">{reviewable ? "Review and allocate" : "Allocation"}</h2>
            <p className="text-xs text-muted">
              {reviewable
                ? "Nothing is reserved until you approve."
                : order.status === "Cancelled"
                  ? "Cancelled. Any reservation was released."
                  : "Approved quantities are locked. Reserved stock leaves on-hand stock on delivery."}
            </p>
          </div>

          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState compact title="No individual varieties requested">
                {order.requested_bundles.length ? `They asked for bundles: ${order.requested_bundles.join(", ")}. Add the varieties you’ll send below.` : "Add the varieties you’ll send below."}
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-sage-100">
              {rows.map((r, idx) => {
                const { seed, issues } = checks[idx];
                return (
                  <li key={r.item.id} className={clsx("px-4 py-3", r.unavailable && "bg-stone-50")}>
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1 basis-36">
                        <p className={clsx("wrap-anywhere font-semibold", r.unavailable ? "text-muted line-through" : "text-forest-900")}>{r.item.requested_seed_name}</p>
                        <p className="text-xs text-muted">
                          {r.item.requested_quantity === null ? "Quantity not specified" : `Requested ${fmtNum(r.item.requested_quantity)}`}
                        </p>
                      </div>
                      <StockLine seed={seed} />
                      {reviewable ? (
                        <label className="block w-24 shrink-0 text-xs font-medium text-forest-900">
                          To approve
                          <input
                            className={clsx(inputCls, "mt-1 text-right font-semibold tabular-nums", issues.some(({ text }) => text === "Whole number required") && "border-red-400 focus:border-red-500")}
                            inputMode="numeric"
                            value={r.unavailable ? "" : r.qty}
                            onChange={(e) => update(idx, { qty: e.target.value.trim() })}
                            disabled={r.unavailable}
                            aria-label={`Approved packets for ${r.item.requested_seed_name}`}
                            aria-invalid={issues.some(({ text }) => text === "Whole number required")}
                          />
                          {r.suggested && !r.unavailable && <span className="mt-1 block text-right font-normal text-muted">Suggested</span>}
                        </label>
                      ) : r.item.unavailable ? (
                        <Badge tone="slate">Unavailable</Badge>
                      ) : (
                        <dl className="flex shrink-0 gap-4 text-sm">
                          <div>
                            <dt className="text-xs text-muted">Approved</dt>
                            <dd className="font-semibold tabular-nums">{r.item.approved_quantity ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">Packed</dt>
                            <dd className="tabular-nums">{(r.item.approved_quantity ?? 0) > 0 ? `${r.item.packed_quantity} / ${r.item.approved_quantity}` : "—"}</dd>
                          </div>
                        </dl>
                      )}
                    </div>

                    {reviewable ? (
                      <>
                        <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-1">
                          {!r.unavailable && (
                            <InventoryMatch
                              seed={seed}
                              seeds={seeds}
                              requestedName={r.item.requested_seed_name}
                              onChange={(seedId) => update(idx, { seedId })}
                            />
                          )}
                          <label className="flex min-h-8 items-center gap-2 text-xs text-muted">
                            <input type="checkbox" className="size-4 accent-forest-600" checked={r.unavailable} onChange={(e) => update(idx, { unavailable: e.target.checked })} />
                            Unavailable
                          </label>
                        </div>
                        {issues.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {issues.map(({ text, tone }) => (
                              <Badge key={text} tone={tone}>
                                <AlertTriangle size={11} aria-hidden /> {text}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </>
                    ) : seed && seedLabel(seed) !== r.item.requested_seed_name && (
                      <p className="mt-1 text-xs text-muted">Matched to {seedLabel(seed)}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {reviewable && (
            <div className="space-y-3 border-t border-sage-100 px-4 py-3">
              {(requestedBundles.length > 0 || otherBundles.length > 0) && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Boxes size={16} className="text-forest-600" aria-hidden />
                  {requestedBundles.length > 0 && <span className="text-forest-900">Requested bundles:</span>}
                  {requestedBundles.map(({ name, template }) =>
                    template && template.items.every((bi) => rows.some((r) => r.item.seed_id === bi.seed_id)) ? (
                      <Badge key={name} tone="green">
                        <CheckCircle2 size={12} aria-hidden /> {template.name} seeds added
                      </Badge>
                    ) : template ? (
                      <Button key={name} size="sm" onClick={() => act({ action: "add_bundle", bundle_id: template.id }, `Added ${template.name} seeds`)} disabled={busy}>
                        <Plus /> Add {template.name} seeds
                      </Button>
                    ) : (
                      <Badge key={name} tone="amber">
                        {name}: no template —{" "}
                        <Link href="/settings" className="underline">
                          create one
                        </Link>
                      </Badge>
                    ),
                  )}
                  {otherBundles.length > 0 && (
                    <select
                      className="h-8 rounded-md border border-sage-200 bg-white px-2 text-[13px] text-forest-800"
                      value=""
                      onChange={(e) => e.target.value && act({ action: "add_bundle", bundle_id: e.target.value }, "Bundle seeds added")}
                      aria-label="Add another bundle"
                    >
                      <option value="">{requestedBundles.length ? "Other bundle…" : "Add a bundle…"}</option>
                      {otherBundles.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newItem.trim()) return;
                  if (await act({ action: "add_item", name: newItem }, `Added ${newItem}`)) setNewItem("");
                }}
              >
                <input className={inputCls} list={`seed-names-${order.id}`} placeholder="Add a variety…" value={newItem} onChange={(e) => setNewItem(e.target.value)} aria-label="Add variety" />
                <datalist id={`seed-names-${order.id}`}>
                  {seeds.map((s) => (
                    <option key={s.id} value={seedLabel(s)} />
                  ))}
                </datalist>
                <Button type="submit" disabled={busy || !newItem.trim()}>
                  <Plus /> Add
                </Button>
              </form>
            </div>
          )}

          {/* Stable place for the review decision. */}
          {reviewable && (
            <div className="sticky bottom-0 flex flex-col gap-3 rounded-b-lg border-t border-sage-200 bg-sage-50/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm" aria-live="polite">
                {blocking ? (
                  <span className="text-amber-900">
                    <AlertTriangle size={14} className="mr-1 inline align-[-2px]" aria-hidden />
                    {issueCount} {issueCount === 1 ? "item needs" : "items need"} attention before approving. You can save progress anytime.
                  </span>
                ) : (
                  <span className="text-muted">
                    Approving reserves <strong className="text-forest-900">{fmtNum(totalApproved)} packets</strong>. On-hand stock changes only on delivery.
                  </span>
                )}
              </p>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button onClick={() => act({ action: "save_review", review: reviewPayload() }, "Review saved")} disabled={busy || rows.length === 0}>
                  <Save /> Save review
                </Button>
                <Button variant="primary" onClick={() => act({ action: "approve", review: reviewPayload() }, `Order #${order.order_number} approved. ${fmtNum(totalApproved)} ${totalApproved === 1 ? "packet" : "packets"} reserved.`)} disabled={busy || blocking || rows.length === 0}>
                  <CheckCircle2 /> Approve and reserve
                </Button>
              </div>
            </div>
          )}
        </section>

        <div className={clsx("grid gap-4", variant === "page" ? "lg:grid-cols-2 2xl:block 2xl:space-y-4" : "md:grid-cols-2")}>
          <section aria-label="Request details" className="rounded-lg border border-sage-200 bg-white">
            <h2 className="border-b border-sage-100 px-4 py-3 text-sm font-semibold text-forest-900">Request details</h2>
            <dl className="divide-y divide-sage-100 text-sm">
              <Detail label="Requester">{order.requester_name}</Detail>
              {order.requester_email && (
                <Detail label="Email">
                  <a href={`mailto:${order.requester_email}`} className="inline-flex items-center gap-1 break-all text-forest-700 hover:underline">
                    <Mail size={13} className="shrink-0" aria-hidden /> {order.requester_email}
                  </a>
                </Detail>
              )}
              {order.mailing_address && (
                <Detail label="Mailing address">
                  <span className="inline-flex gap-1">
                    <MapPin size={13} className="mt-0.5 shrink-0" aria-hidden /> {order.mailing_address}
                  </span>
                </Detail>
              )}
              <Detail label="School use">{order.school_use === null ? "—" : order.school_use ? "Yes" : "No"}</Detail>
              <Detail label="Students / youth">
                <span className="inline-flex items-center gap-1">
                  <Users size={13} aria-hidden /> {order.student_count ?? "—"}
                </span>
              </Detail>
              <Detail label="Bundles">{order.requested_bundles.length ? order.requested_bundles.join(", ") : "—"}</Detail>
              <Detail label="Garden support">{order.garden_support === null ? "—" : order.garden_support ? "Requested" : "No"}</Detail>
              {order.special_requests && <Detail label="Special requests">{order.special_requests}</Detail>}
              <Detail label="Source">
                {order.source}
                {order.external_entry_id && <span className="text-muted"> · entry {order.external_entry_id}</span>}
              </Detail>
              {order.assigned_steward && <Detail label="Seed Steward">{order.assigned_steward}</Detail>}
            </dl>
          </section>
          <section aria-label="Status history" className="rounded-lg border border-sage-200 bg-white">
            <h2 className="border-b border-sage-100 px-4 py-3 text-sm font-semibold text-forest-900">Status history</h2>
            <ol className="space-y-3 px-4 py-3">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-forest-400" aria-hidden />
                  <div>
                    <p className="font-medium text-forest-900">{h.new_status}</p>
                    <p className="text-xs text-muted">
                      {fmtDate(h.changed_at, true)}
                      {h.notes && ` · ${h.notes}`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel order #${order.order_number}?`}>
        <div className="space-y-4 text-sm">
          <p>
            {reserving
              ? "Reserved packets will be released back to available stock. On-hand stock is not changed."
              : "No stock has been reserved for this request yet."}
          </p>
          <input className={inputCls} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Cancellation reason" />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCancelOpen(false)}>Keep order</Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (await act({ action: "cancel", reason: reason || null }, "Order cancelled")) setCancelOpen(false);
              }}
            >
              Cancel order
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function InventoryMatch({ seed, seeds, requestedName, onChange }: { seed: Seed | undefined; seeds: Seed[]; requestedName: string; onChange: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const selectId = useId();
  const matchLabel = seed ? seedLabel(seed) : null;
  return (
    <div className="min-w-0 max-w-full">
      {seed && (
        <div className="flex flex-wrap items-center gap-x-2">
          {matchLabel !== requestedName && <span className="wrap-anywhere text-xs text-muted">Matched to {matchLabel}</span>}
          <button
            type="button"
            className="min-h-8 rounded px-0.5 text-xs font-medium text-forest-700 underline decoration-forest-300 underline-offset-2 hover:text-forest-900"
            aria-label={`${editing ? "Hide match editor" : "Change match"} for ${requestedName}`}
            aria-expanded={editing}
            aria-controls={editing ? selectId : undefined}
            onClick={() => setEditing(!editing)}
          >
            {editing ? "Hide match editor" : "Change match"}
          </button>
        </div>
      )}
      {(!seed || editing) && (
        <select
          id={selectId}
          className={`${inputCls} max-w-full sm:w-64`}
          value={seed?.id ?? ""}
          onChange={(e) => {
            setEditing(true);
            onChange(e.target.value);
          }}
          aria-label={`Inventory item for ${requestedName}`}
        >
          <option value="">Choose inventory item…</option>
          {seeds.map((item) => (
            <option key={item.id} value={item.id}>
              {seedLabel(item)}{item.physical_quantity === null ? " (not counted)" : ` (${availableQuantity(item)} available)`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function StockLine({ seed }: { seed: Seed | undefined }) {
  const available = seed ? availableQuantity(seed) : null;
  return (
    <div className="min-w-24 text-xs">
      <p className="text-muted">Available</p>
      <p className="mt-1 text-sm font-semibold text-forest-900 tabular-nums">
        {available === null ? (seed ? "Not counted" : "Not matched") : fmtNum(available)}
      </p>
      {seed && seed.physical_quantity !== null && (
        <p className="text-muted tabular-nums">{fmtNum(seed.physical_quantity)} on hand · {fmtNum(seed.reserved_quantity)} reserved</p>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 px-4 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-forest-900">{children}</dd>
    </div>
  );
}
