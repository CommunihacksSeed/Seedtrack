"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Search, Upload } from "lucide-react";
import clsx from "clsx";
import { useData } from "@/components/data-provider";
import { downloadExport } from "@/components/download";
import { Badge, Button, Card, EmptyState, Loading, PageHeader, StatusBadge, fmtDate, inputCls, LinkButton } from "@/components/ui";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";

const TABS: ("Needs action" | "All" | OrderStatus)[] = ["Needs action", "All", ...ORDER_STATUSES];

export default function RequestsPage() {
  const { state, toast } = useData();
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Needs action");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    if (!state) return [];
    const db = state.snapshot;
    const needle = q.trim().toLowerCase();
    return db.orders
      .filter((o) =>
        tab === "All" ? true : tab === "Needs action" ? o.status === "Received" || o.status === "Under Review" : o.status === tab,
      )
      .filter((o) => !needle || `${o.order_number} ${o.organization_name} ${o.requester_name} ${o.external_entry_id ?? ""}`.toLowerCase().includes(needle))
      .map((o) => {
        const items = db.order_items.filter((i) => i.order_id === o.id);
        return {
          o,
          items,
          flags: {
            unmatched: items.some((i) => !i.seed_id && !i.unavailable),
            noQty: items.some((i) => i.requested_quantity === null),
          },
        };
      })
      .sort((a, b) => b.o.submitted_at.localeCompare(a.o.submitted_at));
  }, [state, tab, q]);

  if (!state) return <Loading />;
  const count = (t: (typeof TABS)[number]) =>
    t === "All"
      ? state.snapshot.orders.length
      : t === "Needs action"
        ? state.snapshot.orders.filter((o) => o.status === "Received" || o.status === "Under Review").length
        : state.snapshot.orders.filter((o) => o.status === t).length;

  return (
    <>
      <PageHeader
        title="Seed Requests"
        subtitle="Requests from Cognito Forms (imported) or entered by staff. Review each one, then approve to reserve stock."
        actions={
          <>
            <Button onClick={() => downloadExport("orders").catch((e) => toast(e.message, "error"))}>
              <Download size={16} /> Export CSV
            </Button>
            <LinkButton href="/requests/import" disabled={!state.staff}>
                <Upload size={16} /> Import CSV / JSON
              </LinkButton>
            <LinkButton href="/requests/new" variant="primary" disabled={!state.staff}>
                <Plus size={16} /> New request
              </LinkButton>
          </>
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto pb-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={clsx(
              "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t ? "bg-forest-600 text-white" : "bg-white text-forest-800 ring-1 ring-sage-200 hover:bg-sage-50",
            )}
          >
            {t} <span className="opacity-70">{count(t)}</span>
          </button>
        ))}
      </div>

      <Card className="mb-4 p-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className={`${inputCls} pl-9`} placeholder="Search by order #, school, requester or Cognito entry ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search requests" />
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No requests here">{tab === "Needs action" ? "Everything has been reviewed. 🌱" : "Try another tab."}</EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-sage-50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">School / organization</th>
                <th className="px-4 py-3 font-medium">Requested</th>
                <th className="px-4 py-3 text-right font-medium">Students</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-100">
              {rows.map(({ o, items, flags }) => (
                <tr key={o.id} className="cursor-pointer hover:bg-sage-50/60" onClick={() => router.push(`/requests/${o.id}`)}>
                  <td className="px-4 py-3">
                    <Link href={`/requests/${o.id}`} className="font-semibold text-forest-800 hover:underline" onClick={(e) => e.stopPropagation()}>
                      #{o.order_number}
                    </Link>
                    <p className="text-xs text-muted">{o.source}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-forest-900">{o.organization_name}</p>
                    <p className="text-xs text-muted">{o.requester_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>
                      {items.length} {items.length === 1 ? "variety" : "varieties"}
                      {o.requested_bundles.length > 0 && <span className="text-muted"> · bundles: {o.requested_bundles.join(", ")}</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {flags.unmatched && ["Received", "Under Review"].includes(o.status) && <Badge tone="amber">Match needed</Badge>}
                      {flags.noQty && ["Received", "Under Review"].includes(o.status) && <Badge tone="violet">Qty unspecified</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{o.student_count ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{fmtDate(o.submitted_at)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
