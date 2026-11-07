"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Ban, CheckCircle2, Mail, MapPin, Package, Plus, Printer, Save, Truck, Users } from "lucide-react";
import { useData } from "@/components/data-provider";
import { Badge, Button, Card, CardHeader, EmptyState, Loading, Modal, PageHeader, Qty, StatusBadge, fmtDate, inputCls, LinkButton } from "@/components/ui";
import { availableQuantity, seedLabel } from "@/lib/domain";
import { REVIEWABLE_STATUSES, RESERVING_STATUSES, type Order, type OrderItem, type Seed } from "@/lib/types";

type Row = { item: OrderItem; seedId: string; qty: string; unavailable: boolean };

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useData();
  if (!state) return <Loading />;
  const order = state.snapshot.orders.find((o) => o.id === id);
  if (!order)
    return (
      <EmptyState title="Request not found">
        <Link href="/requests" className="text-forest-700 underline">
          Back to requests
        </Link>
      </EmptyState>
    );
  const items = state.snapshot.order_items.filter((i) => i.order_id === id);
  // Re-key so the draft resets whenever the saved order changes.
  return <RequestDetail key={`${order.updated_at}-${items.length}`} order={order} items={items} />;
}

function RequestDetail({ order, items }: { order: Order; items: OrderItem[] }) {
  const { state, mutate, toast } = useData();
  const db = state!.snapshot;
  const staff = state!.staff;
  const seeds = db.seeds;
  const seedById = useMemo(() => new Map(seeds.map((s) => [s.id, s])), [seeds]);
  const reviewable = REVIEWABLE_STATUSES.includes(order.status);
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((item) => ({
      item,
      seedId: item.seed_id ?? "",
      // Proposal: the requested quantity if the requester gave one; otherwise staff must decide.
      qty: item.approved_quantity?.toString() ?? (item.requested_quantity?.toString() ?? ""),
      unavailable: item.unavailable,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const update = (idx: number, patch: Partial<Row>) => setRows((r) => r.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

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
      if (!seed) issues.push({ tone: "amber", text: "Inventory Match Required" });
      else if (seed.physical_quantity === null) issues.push({ tone: "amber", text: "Stock Count Required" });
      else if ((demand.get(seed.id) ?? 0) > availableQuantity(seed)!) issues.push({ tone: "red", text: `Only ${availableQuantity(seed)} available` });
    }
    return { seed, issues };
  });
  const blocking = checks.some((c) => c.issues.length > 0);
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

  return (
    <>
      <Link href="/requests" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-forest-700">
        <ArrowLeft size={14} /> Seed Requests
      </Link>
      <PageHeader
        title={`Order #${order.order_number}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} /> <span className="font-medium text-forest-900">{order.organization_name}</span>
            <span>· submitted {fmtDate(order.submitted_at, true)}</span>
          </span>
        }
        actions={
          staff && (
            <>
              {order.status === "Received" && (
                <Button onClick={() => act({ action: "start_review" }, "Review started")} disabled={busy}>
                  Start review
                </Button>
              )}
              {RESERVING_STATUSES.includes(order.status) && (
                <>
                  <LinkButton href={`/packing/${order.id}/print`}>
                      <Printer size={16} /> Packing list
                    </LinkButton>
                  <LinkButton href="/packing">
                      <Package size={16} /> Packing queue
                    </LinkButton>
                </>
              )}
              {order.status === "Ready" && (
                <Button variant="primary" onClick={() => act({ action: "deliver" }, "Delivered — stock deducted")} disabled={busy}>
                  <Truck size={16} /> Mark delivered
                </Button>
              )}
              {order.status !== "Delivered" && order.status !== "Cancelled" && (
                <Button variant="danger" onClick={() => setCancelOpen(true)} disabled={busy}>
                  <Ban size={16} /> Cancel
                </Button>
              )}
            </>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title={reviewable ? "Review & allocate" : "Allocation"}
              subtitle={
                reviewable
                  ? "Match each requested seed to inventory and decide how many packets to give. Nothing is reserved until you approve."
                  : order.status === "Cancelled"
                    ? "This order was cancelled; any reservation was released."
                    : "Approved quantities are locked. Reserved stock is deducted on delivery."
              }
            />
            {rows.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No individual varieties requested">
                  {order.requested_bundles.length ? `They asked for bundles: ${order.requested_bundles.join(", ")}. Add the varieties you'll send below.` : "Add the varieties you'll send below."}
                </EmptyState>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-sm">
                  <thead className="bg-sage-50 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Requested</th>
                      <th className="px-4 py-2.5 font-medium">Inventory item</th>
                      <th className="px-3 py-2.5 text-right font-medium">Physical</th>
                      <th className="px-3 py-2.5 text-right font-medium">Reserved</th>
                      <th className="px-3 py-2.5 text-right font-medium">Available</th>
                      <th className="px-4 py-2.5 font-medium">{reviewable ? "Approve" : "Approved"}</th>
                      {!reviewable && <th className="px-4 py-2.5 font-medium">Packed</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sage-100">
                    {rows.map((r, idx) => {
                      const { seed, issues } = checks[idx];
                      return (
                        <tr key={r.item.id} className={r.unavailable ? "bg-stone-50 text-muted" : ""}>
                          <td className="px-4 py-3 align-top">
                            <p className="font-medium text-forest-900">{r.item.requested_seed_name}</p>
                            <p className="text-xs text-muted">
                              {r.item.requested_quantity === null ? <em>Quantity not specified</em> : `Asked for ${r.item.requested_quantity}`}
                            </p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            {reviewable ? (
                              <select
                                className={`${inputCls} min-w-48`}
                                value={r.seedId}
                                onChange={(e) => update(idx, { seedId: e.target.value })}
                                disabled={!staff || r.unavailable}
                                aria-label={`Inventory item for ${r.item.requested_seed_name}`}
                              >
                                <option value="">— Choose inventory item —</option>
                                {seeds.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {seedLabel(s)}
                                    {s.physical_quantity === null ? " (not counted)" : ` (${availableQuantity(s)} avail.)`}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span>{seed ? seedLabel(seed) : <em className="text-muted">Not matched</em>}</span>
                            )}
                            {reviewable && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {issues.map((i) => (
                                  <Badge key={i.text} tone={i.tone}>
                                    <AlertTriangle size={11} /> {i.text}
                                  </Badge>
                                ))}
                                {!r.item.seed_id && r.seedId && <Badge tone="green">Matched by staff</Badge>}
                              </div>
                            )}
                          </td>
                          <SeedNumbers seed={seed} />
                          <td className="px-4 py-3 align-top">
                            {reviewable ? (
                              <div className="flex items-center gap-2">
                                <input
                                  className={`${inputCls} w-20 text-right`}
                                  inputMode="numeric"
                                  value={r.unavailable ? "" : r.qty}
                                  onChange={(e) => update(idx, { qty: e.target.value.trim() })}
                                  disabled={!staff || r.unavailable}
                                  aria-label={`Approved packets for ${r.item.requested_seed_name}`}
                                />
                                <label className="flex items-center gap-1.5 text-xs">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-forest-600"
                                    checked={r.unavailable}
                                    onChange={(e) => update(idx, { unavailable: e.target.checked })}
                                    disabled={!staff}
                                  />
                                  Unavailable
                                </label>
                              </div>
                            ) : r.item.unavailable ? (
                              <Badge tone="slate">Unavailable</Badge>
                            ) : (
                              <span className="font-semibold tabular-nums">{r.item.approved_quantity ?? "—"}</span>
                            )}
                          </td>
                          {!reviewable && (
                            <td className="px-4 py-3 align-top tabular-nums">
                              {(r.item.approved_quantity ?? 0) > 0 ? `${r.item.packed_quantity} / ${r.item.approved_quantity}` : "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {reviewable && staff && (
              <div className="space-y-4 border-t border-sage-100 p-4">
                <form
                  className="flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newItem.trim()) return;
                    if (await act({ action: "add_item", name: newItem }, `Added ${newItem}`)) setNewItem("");
                  }}
                >
                  <input className={inputCls} list="seed-names-detail" placeholder="Add a variety (e.g. to fill a bundle)…" value={newItem} onChange={(e) => setNewItem(e.target.value)} aria-label="Add variety" />
                  <datalist id="seed-names-detail">
                    {seeds.map((s) => (
                      <option key={s.id} value={seedLabel(s)} />
                    ))}
                  </datalist>
                  <Button type="submit" disabled={busy || !newItem.trim()}>
                    <Plus size={16} /> Add
                  </Button>
                </form>
                <div className="flex flex-col gap-3 rounded-xl bg-sage-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted">
                    {blocking ? (
                      <span className="text-amber-800">Resolve the flagged items before approving. You can save your progress anytime.</span>
                    ) : (
                      <>
                        Approving will reserve <strong className="text-forest-900">{totalApproved} packets</strong>. Physical stock stays the same until delivery.
                      </>
                    )}
                  </p>
                  <div className="flex shrink-0 gap-2">
                    <Button onClick={() => act({ action: "save_review", review: reviewPayload() }, "Review saved")} disabled={busy || rows.length === 0}>
                      <Save size={16} /> Save review
                    </Button>
                    <Button variant="primary" onClick={() => act({ action: "approve", review: reviewPayload() }, "Approved — stock reserved")} disabled={busy || blocking || rows.length === 0}>
                      <CheckCircle2 size={16} /> Approve & reserve
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Request details" />
            <dl className="space-y-3 p-5 text-sm">
              <Detail label="Requester">{order.requester_name}</Detail>
              {staff ? (
                <>
                  {order.requester_email && (
                    <Detail label="Email">
                      <a href={`mailto:${order.requester_email}`} className="inline-flex items-center gap-1 text-forest-700 hover:underline">
                        <Mail size={13} /> {order.requester_email}
                      </a>
                    </Detail>
                  )}
                  {order.mailing_address && (
                    <Detail label="Mailing address">
                      <span className="inline-flex gap-1">
                        <MapPin size={13} className="mt-0.5 shrink-0" /> {order.mailing_address}
                      </span>
                    </Detail>
                  )}
                </>
              ) : (
                <Detail label="Contact">
                  <em className="text-muted">Hidden — staff only</em>
                </Detail>
              )}
              <Detail label="School use">{order.school_use === null ? "—" : order.school_use ? "Yes" : "No"}</Detail>
              <Detail label="Students / youth">
                <span className="inline-flex items-center gap-1">
                  <Users size={13} /> {order.student_count ?? "—"}
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
          </Card>
          <Card>
            <CardHeader title="Status history" />
            <ol className="space-y-3 p-5">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-forest-400" />
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
          </Card>
        </div>
      </div>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel order #${order.order_number}?`}>
        <div className="space-y-4 text-sm">
          <p>
            {RESERVING_STATUSES.includes(order.status)
              ? "Reserved packets will be released back to available stock. Physical stock is not changed."
              : "No stock has been reserved for this request yet."}
          </p>
          <input className={inputCls} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
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
    </>
  );
}

function SeedNumbers({ seed }: { seed: Seed | undefined }) {
  if (!seed)
    return (
      <>
        <td className="px-3 py-3 text-right align-top text-muted">—</td>
        <td className="px-3 py-3 text-right align-top text-muted">—</td>
        <td className="px-3 py-3 text-right align-top text-muted">—</td>
      </>
    );
  return (
    <>
      <td className="px-3 py-3 text-right align-top">
        <Qty value={seed.physical_quantity} unknownLabel="Unknown" />
      </td>
      <td className="px-3 py-3 text-right align-top tabular-nums">{seed.physical_quantity === null ? "—" : seed.reserved_quantity}</td>
      <td className="px-3 py-3 text-right align-top font-semibold">
        <Qty value={availableQuantity(seed)} unknownLabel="Unknown" />
      </td>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-forest-900">{children}</dd>
    </div>
  );
}
