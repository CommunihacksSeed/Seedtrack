"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  HelpCircle,
  Lock,
  Package,
  PackageCheck,
  Truck,
  Warehouse,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useData } from "@/components/data-provider";
import { Card, CardHeader, EmptyState, Loading, PageHeader, StatCard, StockBadge, timeAgo } from "@/components/ui";
import { availableQuantity, inventorySummary, seedLabel, stockStatus } from "@/lib/domain";
import { distributionRows, lowStockSeeds, requestsOverTime, seedMap, sumBy } from "@/lib/views";
import { MOVEMENT_LABELS } from "@/lib/types";

export default function DashboardPage() {
  const { state, error } = useData();

  const view = useMemo(() => {
    if (!state) return null;
    const db = state.snapshot;
    const inv = inventorySummary(db.seeds);
    const orders = db.orders;
    const seeds = seedMap(db);
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const activity = [
      ...db.order_status_history.map((h) => {
        const o = orderById.get(h.order_id);
        const verb: Record<string, string> = {
          Received: "New seed request received",
          "Under Review": "Review started",
          Approved: "Order approved & stock reserved",
          Preparing: "Packing started",
          Ready: "Packing completed",
          Delivered: "Order delivered",
          Cancelled: "Order cancelled",
        };
        return {
          at: h.changed_at,
          text: verb[h.new_status] ?? h.new_status,
          detail: o ? `#${o.order_number} · ${o.organization_name}` : "",
          href: o ? `/requests/${o.id}` : undefined,
        };
      }),
      ...db.inventory_movements
        .filter((m) => m.movement_type === "initial" || m.movement_type === "adjustment")
        .map((m) => {
          const s = seeds.get(m.seed_id);
          return {
            at: m.created_at,
            text: m.movement_type === "initial" ? "Inventory item counted" : "Stock count adjusted",
            detail: `${s ? seedLabel(s) : "Seed"} · ${MOVEMENT_LABELS[m.movement_type]} ${m.quantity > 0 ? "+" : ""}${m.quantity}`,
            href: "/inventory",
          };
        }),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 9);

    return {
      inv,
      active: orders.filter((o) => !["Delivered", "Cancelled"].includes(o.status)).length,
      awaiting: orders.filter((o) => o.status === "Received" || o.status === "Under Review").length,
      toPack: orders.filter((o) => o.status === "Approved" || o.status === "Preparing").length,
      ready: orders.filter((o) => o.status === "Ready").length,
      delivered: orders.filter((o) => o.status === "Delivered").length,
      byCategory: sumBy(distributionRows(db), (r) => r.category, (r) => r.quantity),
      overTime: requestsOverTime(orders),
      lowStock: lowStockSeeds(db.seeds).slice(0, 5),
      uncounted: db.seeds.filter((s) => s.physical_quantity === null),
      activity,
    };
  }, [state]);

  if (error) return <EmptyState title="Could not load SeedFlow">{error}</EmptyState>;
  if (!state || !view) return <Loading />;
  const { inv } = view;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={state.demo ? "Overview of the fictional demo dataset." : "Live overview of inventory and seed requests."}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Packets on hand" value={inv.physical} icon={<Warehouse size={16} />} hint="Counted items only" />
        <StatCard label="Available packets" value={inv.available} icon={<CheckCircle2 size={16} />} hint="On hand minus reserved" />
        <StatCard label="Reserved packets" value={inv.reserved} icon={<Lock size={16} />} hint="Held for approved orders" />
        <StatCard label="Active requests" value={view.active} icon={<ClipboardList size={16} />} />
        <StatCard label="Awaiting approval" value={view.awaiting} icon={<HelpCircle size={16} />} tone={view.awaiting ? "warn" : "default"} />
        <StatCard label="To pack / ready" value={`${view.toPack} / ${view.ready}`} icon={<Package size={16} />} hint="Approved or preparing / ready to deliver" />
        <StatCard label="Delivered orders" value={view.delivered} icon={<Truck size={16} />} />
      </div>

      {(inv.lowStock > 0 || inv.uncounted > 0) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {inv.lowStock > 0 && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader title={`Low stock alerts (${inv.lowStock})`} action={<AlertTriangle size={18} className="text-amber-600" />} />
              <ul className="divide-y divide-sage-100">
                {view.lowStock.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <span>{seedLabel(s)}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-muted">{availableQuantity(s)} available</span>
                      <StockBadge status={stockStatus(s)} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {inv.uncounted > 0 && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader
                title={`Uncounted inventory (${inv.uncounted})`}
                subtitle="Unknown stock is never treated as zero and can't be allocated until counted."
                action={<HelpCircle size={18} className="text-amber-600" />}
              />
              <ul className="divide-y divide-sage-100">
                {view.uncounted.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <span>{seedLabel(s)}</span>
                    <Link href="/inventory" className="text-xs font-medium text-forest-700 hover:underline">
                      Record a count →
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Packets distributed by category" subtitle="Delivered orders only" />
          <div className="h-64 px-2 py-4">
            {view.byCategory.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={view.byCategory} margin={{ right: 16 }}>
                  <CartesianGrid vertical={false} stroke="#edf1e7" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} tickFormatter={(v: string) => v.split(" ")[0]} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip cursor={{ fill: "#f6f8f3" }} />
                  <Bar dataKey="value" name="Packets" fill="#3f7d53" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No deliveries yet" />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Requests over time" subtitle="Submissions per week" />
          <div className="h-64 px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={view.overTime} margin={{ right: 16 }}>
                <CartesianGrid vertical={false} stroke="#edf1e7" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="requests" name="Requests" stroke="#2f6541" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent activity" action={<PackageCheck size={18} className="text-forest-500" />} />
        {view.activity.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No activity yet" />
          </div>
        ) : (
          <ul className="divide-y divide-sage-100">
            {view.activity.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-forest-900">{a.text}</p>
                  {a.href ? (
                    <Link href={a.href} className="truncate text-xs text-muted hover:text-forest-700 hover:underline">
                      {a.detail}
                    </Link>
                  ) : (
                    <p className="truncate text-xs text-muted">{a.detail}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted">{timeAgo(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
