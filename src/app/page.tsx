"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, ClipboardList, Package, Plus, Sprout, Truck, Upload } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useData } from "@/components/data-provider";
import { Card, CardHeader, EmptyState, ErrorState, LinkButton, Loading, PageHeader, Stat, buttonCls, fmtNum, timeAgo, useReducedMotion } from "@/components/ui";
import { inventorySummary, seedLabel } from "@/lib/domain";
import { distributionRows, lowStockSeeds, requestsOverTime, seedMap, sumBy } from "@/lib/views";
import { MOVEMENT_LABELS } from "@/lib/types";

type Task = {
  key: string;
  count: number;
  title: string;
  detail?: string;
  href: string;
  cta: string;
  icon: React.ReactNode;
};

export default function DashboardPage() {
  const { state, error, refresh } = useData();
  const animate = !useReducedMotion();

  const view = useMemo(() => {
    if (!state) return null;
    const db = state.snapshot;
    const inv = inventorySummary(db.seeds);
    const orders = db.orders;
    const seeds = seedMap(db);
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const count = (...s: string[]) => orders.filter((o) => s.includes(o.status)).length;
    const verb: Record<string, string> = {
      Received: "New seed request received",
      "Under Review": "Review started",
      Approved: "Approved and stock reserved",
      Preparing: "Packing started",
      Ready: "Packed and ready",
      Delivered: "Delivered",
      Cancelled: "Cancelled",
    };
    const activity = [
      ...db.order_status_history.map((h) => {
        const o = orderById.get(h.order_id);
        return { at: h.changed_at, text: verb[h.new_status] ?? h.new_status, detail: o ? `#${o.order_number} · ${o.organization_name}` : "", href: o ? `/requests?id=${o.id}` : undefined };
      }),
      ...db.inventory_movements
        .filter((m) => m.movement_type === "initial" || m.movement_type === "adjustment")
        .map((m) => {
          const s = seeds.get(m.seed_id);
          return {
            at: m.created_at,
            text: m.movement_type === "initial" ? "Seed counted" : "Stock count adjusted",
            detail: `${s ? seedLabel(s) : "Seed"} · ${MOVEMENT_LABELS[m.movement_type]} ${m.quantity > 0 ? "+" : ""}${m.quantity}`,
            href: "/inventory",
          };
        }),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 8);

    const toReview = count("Received", "Under Review");
    const toPack = count("Approved", "Preparing");
    const ready = count("Ready");
    const low = lowStockSeeds(db.seeds);
    const tasks: Task[] = [
      {
        key: "count",
        count: inv.uncounted,
        title: inv.uncounted === 1 ? "1 seed needs a stock count" : `${fmtNum(inv.uncounted)} seeds need a stock count`,
        detail: "Count stock before allocating these seeds.",
        href: "/inventory?view=uncounted",
        cta: "Start counting",
        icon: <CircleDashed />,
      },
      {
        key: "review",
        count: toReview,
        title: toReview === 1 ? "1 request to review" : `${toReview} requests to review`,
        href: "/requests?view=open",
        cta: "Review requests",
        icon: <ClipboardList />,
      },
      {
        key: "pack",
        count: toPack,
        title: toPack === 1 ? "1 order to pack" : `${toPack} orders to pack`,
        href: "/packing",
        cta: "Open packing queue",
        icon: <Package />,
      },
      {
        key: "deliver",
        count: ready,
        title: ready === 1 ? "1 order ready to deliver" : `${ready} orders ready to deliver`,
        href: "/deliveries",
        cta: "Plan deliveries",
        icon: <Truck />,
      },
      {
        key: "low",
        count: low.length,
        title: low.length === 1 ? "1 seed is low or out of stock" : `${low.length} seeds are low or out of stock`,
        detail: low
          .slice(0, 3)
          .map((s) => seedLabel(s))
          .join(", ") + (low.length > 3 ? `, +${low.length - 3} more` : ""),
        href: "/inventory?view=low",
        cta: "View low stock",
        icon: <AlertTriangle />,
      },
    ].filter((t) => t.count > 0);

    return {
      inv,
      tasks,
      firstUse: db.seeds.length === 0 && orders.length === 0,
      active: count("Received", "Under Review", "Approved", "Preparing", "Ready"),
      delivered: count("Delivered"),
      byCategory: sumBy(distributionRows(db), (r) => r.category, (r) => r.quantity),
      overTime: requestsOverTime(orders),
      hasOrders: orders.length > 0,
      activity,
    };
  }, [state]);

  if (error && !state) return <ErrorState message={error} onRetry={refresh} />;
  if (!state || !view) return <Loading label="Loading dashboard" />;
  const { inv } = view;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Your seed requests, stock, and deliveries."
        actions={
          !view.firstUse && (
            <LinkButton href="/requests/new">
              <Plus /> New request
            </LinkButton>
          )
        }
      />

      {view.firstUse ? (
        <EmptyState
          icon={<Sprout />}
          title="Set up SeedFlow"
          action={
            <>
              <LinkButton href="/inventory?import=1" variant="primary">
                <Upload /> Import inventory CSV
              </LinkButton>
              <LinkButton href="/requests/new">
                <Plus /> Enter a request
              </LinkButton>
            </>
          }
        >
          Start by adding your seed inventory. Seeds can be added before they’re counted, then requests can be reviewed against it.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="todo-title" className="mb-5">
            <h2 id="todo-title" className="mb-2 text-sm font-semibold text-forest-900">
              Needs attention
            </h2>
            {view.tasks.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-sage-200 bg-white px-4 py-3 text-sm">
                <CheckCircle2 size={18} className="shrink-0 text-forest-600" aria-hidden />
                <span>
                  <strong className="font-semibold text-forest-900">All caught up.</strong> <span className="text-muted">No counts, reviews, packing or deliveries are waiting.</span>
                </span>
              </div>
            ) : (
              <ul className="divide-y divide-sage-100 overflow-hidden rounded-lg border border-sage-200 bg-white">
                {view.tasks.map((t, i) => (
                  <li key={t.key}>
                    <Link href={t.href} className="flex min-h-14 items-center gap-2 px-3 py-2 hover:bg-sage-50 focus-visible:outline-offset-[-2px] sm:gap-3 sm:px-4">
                      <span className="hidden shrink-0 text-forest-600 sm:block [&_svg]:size-4" aria-hidden>{t.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-forest-900">{t.title}</p>
                        {t.detail && <p className="text-xs text-muted">{t.detail}</p>}
                      </div>
                      <span className={i === 0 ? buttonCls("primary", "sm", "shrink-0") : "flex shrink-0 items-center gap-1 text-xs font-medium text-forest-700"}>
                        {t.cta} <ArrowRight size={14} aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Totals" className="mb-5">
            <Card>
              <dl className="grid grid-cols-2 divide-sage-100 sm:grid-cols-3 lg:grid-cols-6 [&>div]:border-sage-100 max-lg:[&>div]:border-b lg:divide-x">
                <Stat label="Seed varieties" value={fmtNum(inv.varieties)} hint={inv.uncounted ? `${fmtNum(inv.counted)} counted · ${fmtNum(inv.uncounted)} not` : "All counted"} />
                <Stat label="Packets on hand" value={inv.counted ? fmtNum(inv.physical) : "—"} hint={inv.counted ? "Counted seeds only" : "Nothing counted yet"} />
                <Stat label="Reserved" value={inv.counted ? fmtNum(inv.reserved) : "—"} hint="Held for approved orders" />
                <Stat label="Available" value={inv.counted ? fmtNum(inv.available) : "—"} hint="On hand − reserved" emphasis />
                <Stat label="Active requests" value={fmtNum(view.active)} hint="Not yet delivered" />
                <Stat label="Delivered" value={fmtNum(view.delivered)} hint="Orders completed" />
              </dl>
            </Card>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <ChartCard title="Requests over time" subtitle="Submissions per week" empty={!view.hasOrders} emptyText="Appears once requests come in.">
                <LineChart data={view.overTime} margin={{ right: 12, left: -16, top: 4 }}>
                  <CartesianGrid vertical={false} stroke="#edf1e7" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="requests" name="Requests" stroke="#2f6541" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={animate} />
                </LineChart>
              </ChartCard>
              <ChartCard title="Packets delivered by category" subtitle="Delivered orders only" empty={view.byCategory.length === 0} emptyText="Appears after the first delivery.">
                <BarChart data={view.byCategory} margin={{ right: 12, left: -16, top: 4 }}>
                  <CartesianGrid vertical={false} stroke="#edf1e7" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.split(" ")[0]} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "#f6f8f3" }} />
                  <Bar dataKey="value" name="Packets" fill="#3f7d53" radius={[3, 3, 0, 0]} isAnimationActive={animate} />
                </BarChart>
              </ChartCard>
            </div>

            <Card>
              <CardHeader title="Recent activity" />
              {view.activity.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">No activity yet. Counts, approvals and deliveries will show here.</p>
              ) : (
                <ul className="divide-y divide-sage-100">
                  {view.activity.map((a, i) => (
                    <li key={i} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-forest-900">{a.text}</p>
                        {a.href ? (
                          <Link href={a.href} className="block truncate text-xs text-muted hover:text-forest-700 hover:underline">
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
          </div>
        </>
      )}
    </>
  );
}

function ChartCard({
  title,
  subtitle,
  empty,
  emptyText,
  children,
}: {
  title: string;
  subtitle: string;
  empty: boolean;
  emptyText: string;
  children: React.ReactElement;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {empty ? (
        <p className="px-4 py-6 text-center text-sm text-muted">{emptyText}</p>
      ) : (
        <div className="h-52 px-2 py-3">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
