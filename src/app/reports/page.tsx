"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useData } from "@/components/data-provider";
import { downloadExport } from "@/components/download";
import { Button, Card, CardHeader, EmptyState, Loading, PageHeader, StatCard, StatusBadge, StockBadge, fmtDate } from "@/components/ui";
import { availableQuantity, seedLabel, stockStatus } from "@/lib/domain";
import { distributionRows, lowStockSeeds, sumBy } from "@/lib/views";

export default function ReportsPage() {
  const { state, toast } = useData();
  const r = useMemo(() => {
    if (!state) return null;
    const db = state.snapshot;
    const dist = distributionRows(db);
    const delivered = db.orders.filter((o) => o.status === "Delivered").sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? ""));
    return {
      delivered,
      packets: dist.reduce((a, d) => a + d.quantity, 0),
      students: delivered.reduce((a, o) => a + (o.student_count ?? 0), 0),
      byCategory: sumBy(dist, (d) => d.category, (d) => d.quantity),
      byOrg: sumBy(dist, (d) => d.order.organization_name, (d) => d.quantity),
      bySeed: sumBy(dist, (d) => d.seedLabel, (d) => d.quantity).slice(0, 10),
      low: lowStockSeeds(db.seeds),
      outstanding: db.orders
        .filter((o) => !["Delivered", "Cancelled"].includes(o.status))
        .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at)),
      packetsByOrder: new Map(delivered.map((o) => [o.id, dist.filter((d) => d.order.id === o.id).reduce((a, d) => a + d.quantity, 0)])),
    };
  }, [state]);

  if (!state || !r) return <Loading />;
  const exp = (k: string) => downloadExport(k).catch((e) => toast(e.message, "error"));

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="All figures are calculated from database records. Distribution counts only delivered orders."
        actions={
          <>
            <Button onClick={() => exp("inventory")}>
              <Download size={16} /> Inventory
            </Button>
            <Button onClick={() => exp("orders")}>
              <Download size={16} /> Orders
            </Button>
            <Button onClick={() => exp("distribution")}>
              <Download size={16} /> Distribution
            </Button>
            <Button onClick={() => exp("movements")}>
              <Download size={16} /> Stock history
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Completed orders" value={r.delivered.length} />
        <StatCard label="Packets distributed" value={r.packets} />
        <StatCard label="Students / youth reached" value={r.students} hint="As reported on delivered requests" />
        <StatCard label="Outstanding orders" value={r.outstanding.length} tone={r.outstanding.length ? "warn" : "default"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Distribution by crop category" />
          <div className="h-64 px-2 py-4">
            {r.byCategory.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.byCategory} layout="vertical" margin={{ left: 40, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#edf1e7" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                  <Tooltip cursor={{ fill: "#f6f8f3" }} />
                  <Bar dataKey="value" name="Packets" fill="#3f7d53" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No deliveries yet" />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Distribution by organization" />
          <SimpleTable rows={r.byOrg} unit="packets" empty="No deliveries yet" />
        </Card>
        <Card>
          <CardHeader title="Most distributed varieties" />
          <SimpleTable rows={r.bySeed} unit="packets" empty="No deliveries yet" />
        </Card>
        <Card>
          <CardHeader title="Low-stock varieties" subtitle="At or below their low-stock threshold" />
          {r.low.length ? (
            <ul className="divide-y divide-sage-100">
              {r.low.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span>{seedLabel(s)}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-muted">
                      {availableQuantity(s)} avail. / threshold {s.low_stock_threshold ?? "—"}
                    </span>
                    <StockBadge status={stockStatus(s)} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState title="Nothing is running low" />
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Completed orders" />
          {r.delivered.length ? (
            <ul className="divide-y divide-sage-100">
              {r.delivered.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <Link href={`/requests/${o.id}`} className="hover:underline">
                    <span className="font-medium text-forest-900">#{o.order_number}</span> {o.organization_name}
                  </Link>
                  <span className="shrink-0 text-muted">
                    {r.packetsByOrder.get(o.id)} packets · {fmtDate(o.delivered_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState title="No completed orders yet" />
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Outstanding orders" subtitle="Oldest first" />
          {r.outstanding.length ? (
            <ul className="divide-y divide-sage-100">
              {r.outstanding.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <Link href={`/requests/${o.id}`} className="hover:underline">
                    <span className="font-medium text-forest-900">#{o.order_number}</span> {o.organization_name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2 text-muted">
                    {fmtDate(o.submitted_at)} <StatusBadge status={o.status} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState title="All caught up" />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function SimpleTable({ rows, unit, empty }: { rows: { name: string; value: number }[]; unit: string; empty: string }) {
  if (!rows.length)
    return (
      <div className="p-5">
        <EmptyState title={empty} />
      </div>
    );
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5 px-5 py-4">
      {rows.map((r) => (
        <li key={r.name} className="text-sm">
          <div className="flex justify-between">
            <span>{r.name}</span>
            <span className="tabular-nums text-muted">
              {r.value} {unit}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-sage-100">
            <div className="h-1.5 rounded-full bg-forest-500" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
