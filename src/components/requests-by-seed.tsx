"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Badge, EmptyState, StockBadge, fmtNum } from "@/components/ui";
import { availableQuantity, seedLabel, stockStatus } from "@/lib/domain";
import { requestsBySeed, type SeedDemand } from "@/lib/views";
import type { DataSnapshot, OrderStatus } from "@/lib/types";

/**
 * Seed Requests grouped by seed instead of by requester: one row per seed,
 * grouped by crop category, with the packets asked for and the requests that
 * asked. Clicking a request opens it for review.
 */
export function RequestsBySeed({
  db,
  statuses,
  query,
  onOpen,
}: {
  db: DataSnapshot;
  statuses: OrderStatus[];
  query: string;
  onOpen: (orderId: string) => void;
}) {
  const { groups, unmatched } = useMemo(() => requestsBySeed(db, statuses), [db, statuses]);
  const needle = query.trim().toLowerCase();
  const filtered = groups
    .map((g) => ({
      ...g,
      seeds: g.seeds.filter(
        (d) =>
          !needle ||
          `${seedLabel(d.seed)} ${g.category} ${d.lines.map((l) => `${l.order.order_number} ${l.order.organization_name}`).join(" ")}`.toLowerCase().includes(needle),
      ),
    }))
    .filter((g) => g.seeds.length > 0);
  const unmatchedShown = unmatched.filter(
    (l) => !needle || `${l.item.requested_seed_name} ${l.order.order_number} ${l.order.organization_name}`.toLowerCase().includes(needle),
  );

  if (filtered.length === 0 && unmatchedShown.length === 0)
    return <EmptyState compact title={needle ? "No seeds match" : "No seeds requested here"}>Try another tab or clear the search.</EmptyState>;

  return (
    <div className="space-y-5">
      {unmatchedShown.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50/60">
          <h2 className="flex items-center gap-2 border-b border-amber-200 px-4 py-2.5 text-sm font-semibold text-amber-900">
            <AlertTriangle size={15} aria-hidden /> Not matched to inventory ({unmatchedShown.length})
          </h2>
          <ul className="divide-y divide-amber-100">
            {unmatchedShown.map(({ order, item }) => (
              <li key={item.id}>
                <button className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-amber-50" onClick={() => onOpen(order.id)}>
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-forest-900">“{item.requested_seed_name}”</span>
                    <span className="text-muted">
                      {" "}
                      · #{order.order_number} {order.organization_name}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">{item.requested_quantity ?? "qty not given"}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {filtered.map((g) => (
        <section key={g.category}>
          <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide text-forest-800">
            {g.category}
            <span className="text-xs font-normal normal-case tracking-normal text-muted">
              {g.seeds.length} seed{g.seeds.length === 1 ? "" : "s"} requested
            </span>
          </h2>
          <ul className="divide-y divide-sage-100 overflow-hidden rounded-lg border border-sage-200 bg-white">
            {g.seeds.map((d) => (
              <SeedRow key={d.seed.id} d={d} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SeedRow({ d, onOpen }: { d: SeedDemand; onOpen: (orderId: string) => void }) {
  const [open, setOpen] = useState(false);
  const avail = availableQuantity(d.seed);
  const short = avail !== null && d.requested > avail;
  return (
    <li>
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sage-50" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ChevronDown size={16} className={clsx("shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-forest-900">{seedLabel(d.seed)}</span>
          <span className="block text-xs text-muted">
            {d.lines.length} request{d.lines.length === 1 ? "" : "s"}
            {d.unspecified > 0 && ` · ${d.unspecified} didn’t give a quantity`}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-lg font-semibold leading-tight tabular-nums text-forest-900">{fmtNum(d.requested)}</span>
          <span className="block text-[11px] text-muted">packets asked</span>
        </span>
        <span className="hidden w-36 shrink-0 text-right sm:block">
          {avail === null ? (
            <StockBadge status={stockStatus(d.seed)} />
          ) : (
            <span className={clsx("text-xs tabular-nums", short ? "font-medium text-red-700" : "text-muted")}>{fmtNum(avail)} available</span>
          )}
        </span>
      </button>
      {open && (
        <ul className="border-t border-sage-100 bg-sage-50/50">
          {d.lines.map(({ order, item }) => (
            <li key={item.id}>
              <button className="flex w-full items-center justify-between gap-3 py-2 pl-11 pr-4 text-left text-sm hover:bg-sage-100/60" onClick={() => onOpen(order.id)}>
                <span className="min-w-0 truncate">
                  <span className="tabular-nums text-muted">#{order.order_number}</span> {order.organization_name}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {item.unavailable && <Badge tone="slate">Unavailable</Badge>}
                  <span className="tabular-nums">{item.requested_quantity ?? <em className="text-muted">not given</em>}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
