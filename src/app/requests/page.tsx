"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, ClipboardList, Download, Link2, List, Plus, Sprout, Upload } from "lucide-react";
import { useData } from "@/components/data-provider";
import { downloadExport } from "@/components/download";
import { useQueryState } from "@/components/use-query-state";
import { RequestReview } from "@/components/request-review";
import { RequestsBySeed } from "@/components/requests-by-seed";
import { useRouter } from "next/navigation";
import { Badge, Button, EmptyState, ErrorState, LinkButton, Loading, PageHeader, SearchInput, SegmentedTabs, StatusBadge, Toolbar, fmtDate, inputCls } from "@/components/ui";
import type { Order, OrderStatus } from "@/lib/types";
import { REQUEST_VIEW_STATUSES, type RequestView } from "@/lib/views";

type View = RequestView;
const VIEW_STATUSES = REQUEST_VIEW_STATUSES;
const VIEW_LABEL: Record<View, string> = { open: "To review", progress: "In progress", done: "Completed", all: "All" };

function useIsWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

// useSearchParams() needs a Suspense boundary for server rendering.
export default function RequestsPage() {
  return (
    <Suspense fallback={<Loading label="Loading requests" />}>
      <RequestsPageContent />
    </Suspense>
  );
}

function RequestsPageContent() {
  const { state, error, refresh, toast } = useData();
  const [rawView, setView] = useQueryState("view", "open");
  const view = (rawView in VIEW_STATUSES ? rawView : "open") as View;
  const [selectedId, setSelectedId] = useQueryState("id");
  // Default: requests grouped by seed (category → seed → requests). "request" shows one row per request.
  const [rawGroup, setGroup] = useQueryState("group", "seed");
  const group = rawGroup === "request" ? "request" : "seed";
  const router = useRouter();
  const [status, setStatus] = useState<"any" | OrderStatus>("any");
  const [q, setQ] = useState("");
  const wide = useIsWide();

  const orders = useMemo(() => state?.snapshot.orders ?? [], [state]);
  const rows = useMemo(() => {
    if (!state) return [];
    const db = state.snapshot;
    const needle = q.trim().toLowerCase();
    const allowed = status === "any" ? VIEW_STATUSES[view] : [status];
    return orders
      .filter((o) => allowed.includes(o.status))
      .filter((o) => !needle || `${o.order_number} ${o.organization_name} ${o.requester_name} ${o.external_entry_id ?? ""}`.toLowerCase().includes(needle))
      .map((o) => {
        const items = db.order_items.filter((i) => i.order_id === o.id);
        const reviewable = o.status === "Received" || o.status === "Under Review";
        return {
          o,
          varieties: items.length,
          unmatched: reviewable && items.some((i) => !i.seed_id && !i.unavailable),
          noQty: reviewable && items.some((i) => i.requested_quantity === null && i.approved_quantity === null),
        };
      })
      .sort((a, b) => (view === "open" ? a.o.submitted_at.localeCompare(b.o.submitted_at) : b.o.submitted_at.localeCompare(a.o.submitted_at)));
  }, [state, orders, view, status, q]);

  if (error && !state) return <ErrorState message={error} onRetry={refresh} />;
  if (!state) return <Loading label="Loading requests" />;

  const viewCount = (v: View) => orders.filter((o) => VIEW_STATUSES[v].includes(o.status)).length;
  const filtered = q.trim() !== "" || status !== "any";
  const changeView = (v: View) => {
    setView(v);
    setStatus("any");
  };

  // Phones and tablets: a selected request takes the whole page.
  if (!wide && selectedId)
    return <RequestReview orderId={selectedId} variant="panel" onBack={() => setSelectedId(null)} />;

  const shownId = wide ? (selectedId && orders.some((o) => o.id === selectedId) ? selectedId : rows[0]?.o.id ?? null) : null;

  const header = (
    <PageHeader
      title="Seed Requests"
      subtitle={
        group === "seed"
          ? "Requested seeds by category: how many packets are asked for and by which requests."
          : "Review requests against inventory, then approve to reserve stock."
      }
      actions={
        <>
          <Button variant="ghost" onClick={() => downloadExport("orders").catch((e) => toast(e.message, "error"))}>
            <Download /> Export
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              navigator.clipboard
                .writeText(`${window.location.origin}/request`)
                .then(() => toast("Form link copied. Share it with schools."))
                .catch(() => toast(`Form link: ${window.location.origin}/request`))
            }
          >
            <Link2 /> Copy form link
          </Button>
          <LinkButton href="/requests/import">
            <Upload /> Import
          </LinkButton>
          <LinkButton href="/requests/new" variant="primary">
            <Plus /> New request
          </LinkButton>
        </>
      }
    />
  );

  if (orders.length === 0)
    return (
      <>
        {header}
        <EmptyState
          icon={<ClipboardList />}
          title="No requests yet"
          action={
            <>
              <LinkButton href="/requests/import" variant="primary">
                <Upload /> Import from Cognito
              </LinkButton>
              <LinkButton href="/requests/new">
                <Plus /> Enter a request
              </LinkButton>
            </>
          }
        >
          Import a Cognito Forms export or enter a request by hand. New requests appear under “To review”.
        </EmptyState>
      </>
    );

  const empty = filtered ? (
    <EmptyState
      compact
      title="No requests match"
      action={
        <Button
          onClick={() => {
            setQ("");
            setStatus("any");
          }}
        >
          Clear search and status
        </Button>
      }
    >
      Nothing in “{VIEW_LABEL[view]}” matches these filters.
    </EmptyState>
  ) : view === "open" ? (
    <EmptyState compact icon={<CheckCircle2 />} title="Every request has been reviewed" action={<Button onClick={() => changeView("progress")}>See requests in progress</Button>}>
      New requests will appear here.
    </EmptyState>
  ) : (
    <EmptyState compact title={view === "progress" ? "Nothing in progress" : "No completed requests yet"} action={<Button onClick={() => changeView("all")}>Show all requests</Button>} />
  );

  return (
    <>
      {header}
      <Toolbar>
        <SegmentedTabs
          label="Group requests"
          value={group}
          onChange={(g) => setGroup(g)}
          options={[
            { value: "seed", label: "By seed", icon: <Sprout /> },
            { value: "request", label: "By request", icon: <List /> },
          ]}
        />
        <SegmentedTabs
          label="Request view"
          value={view}
          onChange={changeView}
          options={(Object.keys(VIEW_STATUSES) as View[]).map((v) => ({ value: v, label: VIEW_LABEL[v], count: viewCount(v), attention: v === "open" }))}
        />
        <div className="flex flex-1 flex-col gap-2 sm:flex-row md:justify-end">
          <SearchInput
            className="sm:w-72"
            value={q}
            onChange={setQ}
            placeholder={group === "seed" ? "Seed, category, order # or school" : "Order #, school, requester or entry ID"}
            label="Search requests"
          />
          <select className={`${inputCls} sm:w-52`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter by status">
            <option value="any">Any status</option>
            {VIEW_STATUSES[view].map((s) => (
              <option key={s} value={s}>
                {s} ({orders.filter((o) => o.status === s).length})
              </option>
            ))}
          </select>
        </div>
      </Toolbar>

      {group === "seed" ? (
        <RequestsBySeed
          db={state.snapshot}
          statuses={status === "any" ? VIEW_STATUSES[view] : [status]}
          query={q}
          onOpen={(id) => router.push(`/requests/${id}`)}
        />
      ) : rows.length === 0 ? (
        empty
      ) : (
        <div className={clsx(wide && "grid grid-cols-[22rem_minmax(0,1fr)] items-start gap-4")}>
          <RequestList rows={rows} selectedId={shownId} onSelect={(id) => setSelectedId(id)} wide={wide} />
          {wide && shownId && (
            <div className="min-w-0" aria-label="Selected request">
              <RequestReview orderId={shownId} variant="panel" />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function RequestList({
  rows,
  selectedId,
  onSelect,
  wide,
}: {
  rows: { o: Order; varieties: number; unmatched: boolean; noQty: boolean }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  wide: boolean;
}) {
  return (
    <ul
      aria-label="Requests"
      className={clsx("divide-y divide-sage-100 overflow-hidden rounded-lg border border-sage-200 bg-white", wide && "sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto")}
    >
      {rows.map(({ o, varieties, unmatched, noQty }) => {
        const active = o.id === selectedId;
        const content = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate font-semibold text-forest-900">
                <span className="tabular-nums text-muted">#{o.order_number}</span> {o.organization_name}
              </p>
              <StatusBadge status={o.status} />
            </div>
            <p className="mt-0.5 truncate text-sm text-muted">
              {o.requester_name} · {varieties} {varieties === 1 ? "variety" : "varieties"}
              {o.requested_bundles.length > 0 && ` · ${o.requested_bundles.length} bundle${o.requested_bundles.length === 1 ? "" : "s"}`}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">{fmtDate(o.submitted_at)}</span>
              {unmatched && <Badge tone="amber">Match needed</Badge>}
              {noQty && <Badge tone="violet">Quantity not given</Badge>}
            </div>
          </>
        );
        const cls = clsx(
          "relative block w-full px-4 py-3 text-left transition-colors",
          active ? "bg-forest-600/10" : "hover:bg-sage-50",
        );
        return (
          <li key={o.id}>
            {wide ? (
              <button className={cls} onClick={() => onSelect(o.id)} aria-current={active ? "true" : undefined}>
                {active && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-forest-600" />}
                {content}
              </button>
            ) : (
              <Link href={`/requests/${o.id}`} className={cls}>
                {content}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
