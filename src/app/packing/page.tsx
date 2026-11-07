"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { CheckCircle2, Circle, ClipboardList, PackageOpen, Printer, Sprout, Truck, UserRound } from "lucide-react";
import { useData } from "@/components/data-provider";
import { Button, LinkButton, Card, EmptyState, ErrorState, Loading, PageHeader, SectionTitle, SegmentedTabs, StatusBadge, Toolbar, fmtDate, fmtNum, inputCls } from "@/components/ui";
import { seedLabel } from "@/lib/domain";
import { seedPickList } from "@/lib/views";
import type { Order, OrderItem, Seed } from "@/lib/types";

type View = "seed" | "order";

export default function PackingPage() {
  const { state, error, refresh } = useData();
  const [stewardFilter, setStewardFilter] = useState("");
  const [view, setView] = useState<View>("seed");
  if (error && !state) return <ErrorState message={error} onRetry={refresh} />;
  if (!state) return <Loading label="Loading packing queue" />;
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
        subtitle="Pack approved orders, then mark them ready. Delivering an order deducts its stock."
        actions={
          view === "seed" &&
          toPack.length > 0 && (
            <LinkButton href="/packing/pick-list">
              <Printer /> Print pick list
            </LinkButton>
          )
        }
      />

      <Toolbar>
        <SegmentedTabs
          label="Packing view"
          value={view}
          onChange={setView}
          options={[
            { value: "seed", label: "By seed", icon: <Sprout /> },
            { value: "order", label: "By order", icon: <ClipboardList /> },
          ]}
        />
        <div className="relative md:ml-auto">
          <UserRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input className={`${inputCls} pl-9 md:w-60!`} placeholder="Show one steward’s orders" value={stewardFilter} onChange={(e) => setStewardFilter(e.target.value)} aria-label="Filter by Seed Steward" />
        </div>
      </Toolbar>

      <SectionTitle count={toPack.length}>
        <PackageOpen size={16} className="text-forest-600" aria-hidden /> To pack
      </SectionTitle>
      {view === "seed" ? (
        <SeedView orders={toPack} />
      ) : (
        <section>
          {toPack.length === 0 ? (
            <EmptyState compact title="Nothing to pack right now">Approved orders show up here.</EmptyState>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {toPack.map((o) => (
                <PackCard key={`${o.id}-${o.updated_at}`} order={o} items={items(o)} seeds={seeds} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="mt-8">
        <SectionTitle
          count={ready.length}
          action={
            ready.length > 0 && (
              <LinkButton href="/deliveries" size="sm">
                <Truck /> Plan deliveries
              </LinkButton>
            )
          }
        >
          <Truck size={16} className="text-forest-600" aria-hidden /> Ready for delivery
        </SectionTitle>
        {ready.length === 0 ? (
          <EmptyState compact title="No packed orders waiting">Orders appear here after they’re marked ready.</EmptyState>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {ready.map((o) => (
              <PackCard key={`${o.id}-${o.updated_at}`} order={o} items={items(o)} seeds={seeds} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/** Seed-first packing: totals per seed across every approved order. */
function SeedView({ orders }: { orders: Order[] }) {
  const { state, mutate, toast } = useData();
  const [busy, setBusy] = useState(false);
  const db = state!.snapshot;
  const groups = seedPickList(db, orders);

  async function pack(packs: { order: Order; item: OrderItem; qty: number }[], msg?: string) {
    setBusy(true);
    try {
      // Group by order: one validated request per order.
      const perOrder = new Map<string, { item_id: string; packed_quantity: number }[]>();
      for (const p of packs) perOrder.set(p.order.id, [...(perOrder.get(p.order.id) ?? []), { item_id: p.item.id, packed_quantity: p.qty }]);
      for (const [orderId, list] of perOrder) await mutate(`/api/orders/${orderId}`, { action: "pack", packs: list });
      if (msg) toast(msg);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function ready(o: Order) {
    setBusy(true);
    try {
      await mutate(`/api/orders/${o.id}`, { action: "ready" });
      toast(`#${o.order_number} is ready for delivery`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (orders.length === 0)
    return <EmptyState compact title="Nothing to pack right now">Approved orders show up here, grouped by seed.</EmptyState>;

  const totalPackets = groups.reduce((a, g) => a + g.total, 0);
  const packedPackets = groups.reduce((a, g) => a + g.packed, 0);
  const fullyPacked = orders.filter((o) =>
    db.order_items.filter((i) => i.order_id === o.id && (i.approved_quantity ?? 0) > 0).every((i) => i.packed_quantity === i.approved_quantity),
  );

  return (
    <>
      <Card className="mb-3 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
        <span>
          <strong className="text-forest-900">{groups.length}</strong> varieties · <strong className="text-forest-900">{fmtNum(totalPackets)}</strong> packets ·{" "}
          <strong className="text-forest-900">{orders.length}</strong> orders
        </span>
        <span className="flex items-center gap-3">
          <span className="h-2 w-40 rounded-full bg-sage-100" role="progressbar" aria-valuemin={0} aria-valuemax={totalPackets} aria-valuenow={packedPackets} aria-label="Packets packed">
            <span className="block h-2 rounded-full bg-forest-500 transition-[width]" style={{ width: `${totalPackets ? (packedPackets / totalPackets) * 100 : 0}%` }} />
          </span>
          <span className="tabular-nums text-muted">
            {packedPackets}/{totalPackets} packed
          </span>
        </span>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((g) => {
          const done = g.packed === g.total;
          return (
            <Card key={g.seed.id} className={clsx(done && "border-forest-200 bg-forest-50/30")}>
              <div className="flex items-start justify-between gap-3 border-b border-sage-100 px-4 py-3">
                <div>
                  <p className="font-semibold text-forest-900">{seedLabel(g.seed)}</p>
                  <p className="text-xs text-muted">
                    {g.seed.storage_location ? `${g.seed.storage_location} · ` : ""}
                    {g.lines.length} order{g.lines.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-semibold leading-none tabular-nums text-forest-900">{fmtNum(g.total)}</p>
                  <p className="mt-1 text-xs text-muted">{g.seed.unit} to pack</p>
                </div>
              </div>
              <ul className="divide-y divide-sage-100">
                {g.lines.map(({ order, item }) => {
                  const packed = item.packed_quantity === item.approved_quantity;
                  return (
                    <li key={item.id}>
                      <button
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-sage-50 disabled:cursor-default disabled:hover:bg-transparent"
                        disabled={busy}
                        onClick={() => pack([{ order, item, qty: packed ? 0 : item.approved_quantity! }])}
                        aria-pressed={packed}
                      >
                        {packed ? <CheckCircle2 size={20} className="shrink-0 text-forest-600" /> : <Circle size={20} className="shrink-0 text-stone-300" />}
                        <span className={clsx("flex-1", packed && "text-muted line-through decoration-forest-300")}>
                          #{order.order_number} · {order.organization_name}
                          {order.assigned_steward && <span className="text-xs text-muted"> ({order.assigned_steward})</span>}
                        </span>
                        <span className="font-semibold tabular-nums">× {item.approved_quantity}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t border-sage-100 px-4 py-3">
                <span className="text-xs tabular-nums text-muted">
                  {g.packed} / {g.total} packed
                </span>
                {(
                  <Button
                    size="sm"
                    variant={done ? "secondary" : "primary"}
                    disabled={busy || done}
                    onClick={() =>
                      pack(
                        g.lines.filter((l) => l.item.packed_quantity !== l.item.approved_quantity).map((l) => ({ ...l, qty: l.item.approved_quantity! })),
                        `All ${seedLabel(g.seed)} packed`,
                      )
                    }
                  >
                    <CheckCircle2 /> {done ? "All packed" : `Pack all ${g.total}`}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {fullyPacked.length > 0 && (
        <Card className="mt-4 border-forest-200">
          <div className="border-b border-sage-100 px-4 py-3">
            <p className="font-semibold text-forest-900">Orders with everything packed</p>
            <p className="text-xs text-muted">Bag them up and mark them ready for delivery.</p>
          </div>
          <ul className="divide-y divide-sage-100">
            {fullyPacked.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <Link href={`/requests?id=${o.id}`} className="hover:underline">
                  <span className="font-medium text-forest-900">#{o.order_number}</span> {o.organization_name}
                </Link>
                <span className="flex gap-2">
                  <LinkButton size="sm" href={`/packing/${o.id}/print`}>
                    <Printer /> Slip
                  </LinkButton>
                  <Button size="sm" variant="primary" onClick={() => ready(o)} disabled={busy}>
                    <CheckCircle2 /> Mark ready
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function PackCard({ order, items, seeds }: { order: Order; items: OrderItem[]; seeds: Map<string, Seed> }) {
  const { mutate, toast } = useData();
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
      <div className="flex items-start justify-between gap-3 border-b border-sage-100 px-4 py-3">
        <div>
          <Link href={`/requests?id=${order.id}`} className="font-semibold text-forest-900 hover:underline">
            #{order.order_number} · {order.organization_name}
          </Link>
          <p className="text-xs text-muted">Approved {fmtDate(order.approved_at)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="flex-1 space-y-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <UserRound size={15} className="shrink-0 text-muted" />
          <input
            className={`${inputCls} py-1.5`}
            placeholder="Assign a Seed Steward"
            value={steward}
            onChange={(e) => setSteward(e.target.value)}
            onBlur={() => steward !== (order.assigned_steward ?? "") && act({ action: "assign", steward: steward || null }, "Steward assigned")}
           
            aria-label="Assigned Seed Steward"
          />
        </div>
        {order.special_requests && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>Note:</strong> {order.special_requests}
          </p>
        )}
        <ul className="divide-y divide-sage-100 rounded-md border border-sage-200">
          {items.map((i) => {
            const s = i.seed_id ? seeds.get(i.seed_id) : undefined;
            const packed = i.packed_quantity === i.approved_quantity;
            return (
              <li key={i.id}>
                <button
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-sage-50 disabled:cursor-default disabled:hover:bg-transparent"
                  disabled={!packing || busy}
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

      {(
        <div className="flex flex-wrap justify-end gap-2 border-t border-sage-100 px-4 py-3">
          <LinkButton href={`/packing/${order.id}/print`} size="sm">
              <Printer /> Packing list
            </LinkButton>
          {order.status === "Approved" && (
            <Button size="sm" onClick={() => act({ action: "start_preparing" }, "Marked as preparing")} disabled={busy}>
              Start packing
            </Button>
          )}
          {packing && (
            <Button size="sm" variant="primary" onClick={() => act({ action: "ready" }, `#${order.order_number} is ready`)} disabled={busy || !allPacked} title={allPacked ? undefined : "Pack every item first"}>
              <CheckCircle2 /> Mark ready
            </Button>
          )}
          {order.status === "Ready" && (
            <Button size="sm" variant="primary" onClick={() => act({ action: "deliver" }, `#${order.order_number} delivered — stock deducted`)} disabled={busy}>
              <Truck /> Mark delivered
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
