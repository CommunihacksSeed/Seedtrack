"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer, Sprout } from "lucide-react";
import { useData } from "@/components/data-provider";
import { Button, EmptyState, Loading } from "@/components/ui";

/** Printer-friendly packing slip. Deliberately omits requester email and address. */
export default function PackingListPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useData();
  if (!state) return <Loading />;
  const db = state.snapshot;
  const order = db.orders.find((o) => o.id === id);
  if (!order) return <EmptyState title="Order not found" />;
  const seeds = new Map(db.seeds.map((s) => [s.id, s]));
  const items = db.order_items.filter((i) => i.order_id === id && (i.approved_quantity ?? 0) > 0);
  const unavailable = db.order_items.filter((i) => i.order_id === id && i.unavailable);
  const total = items.reduce((a, i) => a + (i.approved_quantity ?? 0), 0);

  return (
    <>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/packing" className="inline-flex items-center gap-1 text-sm text-muted hover:text-forest-700">
          <ArrowLeft size={14} /> Packing Queue
        </Link>
        <Button variant="primary" onClick={() => window.print()}>
          <Printer size={16} /> Print
        </Button>
      </div>

      <article className="print-area mx-auto max-w-3xl rounded-lg border border-sage-200 bg-white p-8 text-ink shadow-sm">
        <header className="flex items-start justify-between border-b-2 border-forest-800 pb-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-forest-700">
              <Sprout size={16} /> SeedFlow packing list
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold">Order #{order.order_number}</h1>
            <p className="mt-1 text-lg">{order.organization_name}</p>
          </div>
          <dl className="text-right text-sm">
            <dt className="text-muted">Printed</dt>
            <dd>{new Date().toLocaleDateString()}</dd>
            <dt className="mt-2 text-muted">Seed Steward</dt>
            <dd>{order.assigned_steward ?? "________________"}</dd>
          </dl>
        </header>

        {order.special_requests && (
          <section className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <strong>Packing notes:</strong> {order.special_requests}
          </section>
        )}

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-stone-400 text-left">
              <th className="w-10 py-2">✓</th>
              <th className="py-2">Seed</th>
              <th className="py-2">Variety</th>
              <th className="py-2 text-right">Approved</th>
              <th className="py-2 text-right">Packed</th>
              <th className="py-2 pl-6">Location</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const s = i.seed_id ? seeds.get(i.seed_id) : undefined;
              return (
                <tr key={i.id} className="border-b border-stone-200">
                  <td className="py-3">
                    <span className="inline-block h-5 w-5 rounded border-2 border-stone-500 text-center text-xs leading-4">{i.packed_quantity === i.approved_quantity ? "✓" : ""}</span>
                  </td>
                  <td className="py-3 font-medium">{s?.name ?? i.requested_seed_name}</td>
                  <td className="py-3">{s?.variety ?? "—"}</td>
                  <td className="py-3 text-right text-base font-semibold tabular-nums">{i.approved_quantity}</td>
                  <td className="py-3 text-right tabular-nums">______</td>
                  <td className="py-3 pl-6 text-muted">{s?.storage_location ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td className="pt-3 font-semibold" colSpan={2}>
                Total packets
              </td>
              <td className="pt-3 text-right text-base font-semibold tabular-nums">{total}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>

        {unavailable.length > 0 && (
          <p className="mt-4 text-sm text-muted">Not included (unavailable): {unavailable.map((i) => i.requested_seed_name).join(", ")}</p>
        )}
        {order.requested_bundles.length > 0 && <p className="mt-2 text-sm text-muted">Requested bundles: {order.requested_bundles.join(", ")}</p>}

        <footer className="mt-10 grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="h-8 border-b border-stone-400" />
            <p className="mt-1 text-muted">Packed by</p>
          </div>
          <div>
            <div className="h-8 border-b border-stone-400" />
            <p className="mt-1 text-muted">Checked by / date</p>
          </div>
        </footer>
        <p className="mt-8 text-center text-[10px] text-muted">Youth in Food Systems · Youth Seed Stewards — generated by SeedFlow (CommuniHacks 2026 prototype)</p>
      </article>
    </>
  );
}
