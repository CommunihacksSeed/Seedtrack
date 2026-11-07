"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { CheckCircle2, Circle, PackageOpen, Printer, Truck, UserRound } from "lucide-react";
import { useData } from "@/components/data-provider";
import { Button, LinkButton, Card, EmptyState, Loading, PageHeader, StatusBadge, fmtDate, inputCls } from "@/components/ui";
import { seedLabel } from "@/lib/domain";
import type { Order, OrderItem, Seed } from "@/lib/types";

export default function PackingPage() {
  const { state } = useData();
  const [stewardFilter, setStewardFilter] = useState("");
  if (!state) return <Loading />;
  const db = state.snapshot;
  const seeds = new Map(db.seeds.map((s) => [s.id, s]));
  const byOldest = (a: Order, b: Order) => (a.approved_at ?? a.submitted_at).localeCompare(b.approved_at ?? b.submitted_at);
  const match = (o: Order) => !stewardFilter || (o.assigned_steward ?? "").toLowerCase().includes(stewardFilter.toLowerCase());
  const toPack = db.orders.filter((o) => (o.status === "Approved" || o.status === "Preparing") && match(o)).sort(byOldest);
  const ready = db.orders.filter((o) => o.status === "Ready" && match(o)).sort(byOldest);
  const items = (o: Order) => db.order_items.filter((i) => i.order_id === o.id && (i.approved_quantity ?? 0) > 0);

  return (
    <>
      <PageHeader
        title="Packing Queue"
        subtitle="For Youth Seed Stewards: pack each approved order, tick off the items, then mark it ready."
        actions={
          <div className="relative">
            <UserRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className={`${inputCls} w-56 pl-9`} placeholder="Show my orders (name)…" value={stewardFilter} onChange={(e) => setStewardFilter(e.target.value)} aria-label="Filter by Seed Steward" />
          </div>
        }
      />

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-forest-900">
          <PackageOpen size={18} /> To pack <span className="text-sm font-normal text-muted">({toPack.length})</span>
        </h2>
        {toPack.length === 0 ? (
          <EmptyState title="Nothing to pack right now">Approved orders show up here.</EmptyState>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {toPack.map((o) => (
              <PackCard key={`${o.id}-${o.updated_at}`} order={o} items={items(o)} seeds={seeds} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-forest-900">
          <Truck size={18} /> Ready for delivery <span className="text-sm font-normal text-muted">({ready.length})</span>
        </h2>
        {ready.length === 0 ? (
          <EmptyState title="No packed orders waiting" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {ready.map((o) => (
              <PackCard key={`${o.id}-${o.updated_at}`} order={o} items={items(o)} seeds={seeds} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function PackCard({ order, items, seeds }: { order: Order; items: OrderItem[]; seeds: Map<string, Seed> }) {
  const { state, mutate, toast } = useData();
  const staff = state!.staff;
  const [busy, setBusy] = useState(false);
  const [steward, setSteward] = useState(order.assigned_steward ?? "");
  const packing = order.status === "Approved" || order.status === "Preparing";
  const done = items.filter((i) => i.packed_quantity === i.approved_quantity).length;
  const allPacked = done === items.length;

  async function act(body: unknown, msg?: string) {
    setBusy(true);
    try {
      await mutate(`/api/orders/${order.id}`, body);
      if (msg) toast(msg);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={clsx("flex flex-col", order.status === "Ready" && "border-forest-200 bg-forest-50/30")}>
      <div className="flex items-start justify-between gap-3 border-b border-sage-100 px-5 py-4">
        <div>
          <Link href={`/requests/${order.id}`} className="font-semibold text-forest-900 hover:underline">
            #{order.order_number} · {order.organization_name}
          </Link>
          <p className="text-xs text-muted">Approved {fmtDate(order.approved_at)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="flex-1 space-y-3 px-5 py-4">
        <div className="flex items-center gap-2">
          <UserRound size={15} className="shrink-0 text-muted" />
          <input
            className={`${inputCls} py-1.5`}
            placeholder="Assign a Seed Steward"
            value={steward}
            onChange={(e) => setSteward(e.target.value)}
            onBlur={() => steward !== (order.assigned_steward ?? "") && act({ action: "assign", steward: steward || null }, "Steward assigned")}
            disabled={!staff}
            aria-label="Assigned Seed Steward"
          />
        </div>
        {order.special_requests && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>Note:</strong> {order.special_requests}
          </p>
        )}
        <ul className="divide-y divide-sage-100 rounded-xl border border-sage-200">
          {items.map((i) => {
            const s = i.seed_id ? seeds.get(i.seed_id) : undefined;
            const packed = i.packed_quantity === i.approved_quantity;
            return (
              <li key={i.id}>
                <button
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-sage-50 disabled:cursor-default disabled:hover:bg-transparent"
                  disabled={!packing || !staff || busy}
                  onClick={() => act({ action: "pack", packs: [{ item_id: i.id, packed_quantity: packed ? 0 : i.approved_quantity }] })}
                  aria-pressed={packed}
                >
                  {packed ? <CheckCircle2 size={20} className="shrink-0 text-forest-600" /> : <Circle size={20} className="shrink-0 text-stone-300" />}
                  <span className={clsx("flex-1", packed && "text-muted line-through decoration-forest-300")}>{s ? seedLabel(s) : i.requested_seed_name}</span>
                  <span className="font-semibold tabular-nums">× {i.approved_quantity}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">
          {done} of {items.length} items packed
        </p>
      </div>

      {staff && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-sage-100 px-5 py-3">
          <LinkButton href={`/packing/${order.id}/print`} size="sm">
              <Printer size={14} /> Packing list
            </LinkButton>
          {order.status === "Approved" && (
            <Button size="sm" onClick={() => act({ action: "start_preparing" }, "Marked as preparing")} disabled={busy}>
              Start packing
            </Button>
          )}
          {packing && (
            <Button size="sm" variant="primary" onClick={() => act({ action: "ready" }, `#${order.order_number} is ready`)} disabled={busy || !allPacked} title={allPacked ? undefined : "Pack every item first"}>
              <CheckCircle2 size={14} /> Mark ready
            </Button>
          )}
          {order.status === "Ready" && (
            <Button size="sm" variant="primary" onClick={() => act({ action: "deliver" }, `#${order.order_number} delivered — stock deducted`)} disabled={busy}>
              <Truck size={14} /> Mark delivered
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
