"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Papa from "papaparse";
import { ClipboardCheck, Download, History, Info, Pencil, Plus, Sprout, Trash2, Upload } from "lucide-react";
import { useData } from "@/components/data-provider";
import { downloadExport } from "@/components/download";
import { useQueryState } from "@/components/use-query-state";
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeader,
  Qty,
  SearchInput,
  SegmentedTabs,
  StockBadge,
  Toolbar,
  fmtDate,
  fmtNum,
  inputCls,
  tableCls,
  type MenuItem,
} from "@/components/ui";
import { availableQuantity, seedLabel, stockStatus } from "@/lib/domain";
import { CATEGORIES, MOVEMENT_LABELS, type Seed } from "@/lib/types";
import { rowToSeedInput } from "@/lib/import-mapping";
import { INVENTORY_VIEW_TEST, type InventoryView } from "@/lib/views";

type View = InventoryView;
const VIEW_TEST = INVENTORY_VIEW_TEST;

// useSearchParams() needs a Suspense boundary for server rendering.
export default function InventoryPage() {
  return (
    <Suspense fallback={<Loading label="Loading inventory" />}>
      <InventoryPageContent />
    </Suspense>
  );
}

function InventoryPageContent() {
  const { state, error, refresh, mutate, toast } = useData();
  const [rawView, setView] = useQueryState("view", "all");
  const view = (rawView in VIEW_TEST ? rawView : "all") as View;
  const [selectedId, setSelectedId] = useQueryState("seed");
  const [importParam, setImportParam] = useQueryState("import");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [editing, setEditing] = useState<Seed | "new" | null>(null);
  const [countingId, setCountingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const importing = importOpen || importParam === "1";

  const all = useMemo(() => state?.snapshot.seeds ?? [], [state]);
  const counts = useMemo(
    () => Object.fromEntries((Object.keys(VIEW_TEST) as View[]).map((v) => [v, all.filter(VIEW_TEST[v]).length])) as Record<View, number>,
    [all],
  );
  const seeds = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter(VIEW_TEST[view])
      .filter((s) => cat === "All" || s.category === cat)
      .filter((s) => !needle || `${seedLabel(s)} ${s.storage_location ?? ""} ${s.category}`.toLowerCase().includes(needle))
      .sort((a, b) => seedLabel(a).localeCompare(seedLabel(b)));
  }, [all, view, cat, q]);

  if (error && !state) return <ErrorState message={error} onRetry={refresh} />;
  if (!state) return <Loading label="Loading inventory" />;

  const selected = all.find((s) => s.id === selectedId) ?? null;
  const counting = all.find((s) => s.id === countingId) ?? null;
  const filtered = q.trim() !== "" || cat !== "All";
  // "Save and count next" walks the seeds currently listed that still need a count.
  const nextToCount = (after: Seed) => seeds.find((s) => s.id !== after.id && s.physical_quantity === null) ?? null;

  async function remove(s: Seed) {
    if (!confirm(`Delete ${seedLabel(s)} from inventory? This can't be undone.`)) return;
    try {
      await mutate(`/api/seeds/${s.id}`, undefined, "DELETE");
      toast(`Deleted ${seedLabel(s)}`);
      if (selectedId === s.id) setSelectedId(null);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const menuFor = (s: Seed): MenuItem[] => [
    { label: "View details", icon: <Info />, onSelect: () => setSelectedId(s.id) },
    { label: "Stock history", icon: <History />, onSelect: () => setSelectedId(s.id) },
    { label: "Edit details", icon: <Pencil />, onSelect: () => setEditing(s) },
    { label: "Delete seed", icon: <Trash2 />, danger: true, onSelect: () => remove(s) },
  ];

  const countButton = (s: Seed) => (
    <Button size="sm" onClick={() => setCountingId(s.id)} aria-label={`${s.physical_quantity === null ? "Count" : "Recount"} ${seedLabel(s)}`}>
      <ClipboardCheck /> {s.physical_quantity === null ? "Count" : "Recount"}
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Seed Inventory"
        subtitle="Packets on hand, reserved for approved orders, and available to allocate."
        actions={
          <>
            <Button variant="ghost" onClick={() => downloadExport("inventory").catch((e) => toast(e.message, "error"))}>
              <Download /> Export
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <Upload /> Import CSV
            </Button>
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus /> Add seed
            </Button>
          </>
        }
      />

      {all.length === 0 ? (
        <EmptyState
          icon={<Sprout />}
          title="No seeds in inventory yet"
          action={
            <>
              <Button variant="primary" onClick={() => setImportOpen(true)}>
                <Upload /> Import CSV
              </Button>
              <Button onClick={() => setEditing("new")}>
                <Plus /> Add a seed
              </Button>
            </>
          }
        >
          Import your seed list or add seeds one at a time. Seeds can be added before anyone counts them.
        </EmptyState>
      ) : (
        <>
          <Toolbar>
            <SegmentedTabs
              label="Inventory view"
              value={view}
              onChange={(v) => setView(v)}
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "uncounted", label: "Needs count", count: counts.uncounted, attention: true },
                { value: "low", label: "Low stock", count: counts.low, attention: true },
                { value: "allocatable", label: "Allocatable", count: counts.allocatable },
              ]}
            />
            <div className="flex flex-1 flex-col gap-2 sm:flex-row md:justify-end">
              <SearchInput className="sm:w-72" value={q} onChange={setQ} placeholder="Search name, variety or location" label="Search seeds" />
              <select className={`${inputCls} sm:w-52`} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category">
                <option value="All">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </Toolbar>

          {seeds.length === 0 ? (
            filtered ? (
              <EmptyState
                compact
                title="No seeds match your search"
                action={
                  <Button
                    onClick={() => {
                      setQ("");
                      setCat("All");
                    }}
                  >
                    Clear search and category
                  </Button>
                }
              />
            ) : view === "uncounted" ? (
              <EmptyState compact icon={<ClipboardCheck />} title="Every seed has been counted" action={<Button onClick={() => setView("all")}>Show all seeds</Button>} />
            ) : (
              <EmptyState compact title={view === "low" ? "Nothing is low or out of stock" : "No seeds have packets available"} action={<Button onClick={() => setView("all")}>Show all seeds</Button>} />
            )
          ) : (
            <>
              {/* Wide screens: table */}
              <Card className="relative hidden overflow-x-auto xl:block">
                <table className={tableCls.table}>
                  <thead className={tableCls.thead}>
                    <tr>
                      <th className={`${tableCls.th} min-w-56`}>Seed</th>
                      <th className={`${tableCls.th} hidden 2xl:table-cell`}>Category</th>
                      <th className={tableCls.thNum}>On hand</th>
                      <th className={tableCls.thNum}>Reserved</th>
                      <th className={tableCls.thNum}>Available</th>
                      <th className={tableCls.th}>Status</th>
                      <th className={`${tableCls.th} hidden lg:table-cell`}>Location</th>
                      <th className={`${tableCls.th} text-right`}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {seeds.map((s) => (
                      <tr key={s.id} className={`${tableCls.tr} group hover:bg-sage-50`}>
                        <td className={tableCls.td}>
                          <button className="whitespace-nowrap text-left hover:underline" onClick={() => setSelectedId(s.id)}>
                            <span className="font-semibold text-forest-900">{s.name}</span>
                            {s.variety && <span className="text-muted"> · {s.variety}</span>}
                          </button>
                        </td>
                        <td className={`${tableCls.td} hidden whitespace-nowrap text-muted 2xl:table-cell`}>{s.category}</td>
                        <td className={tableCls.tdNum}>
                          <Qty value={s.physical_quantity} />
                        </td>
                        <td className={`${tableCls.tdNum} text-muted`}>{s.physical_quantity === null ? "—" : fmtNum(s.reserved_quantity)}</td>
                        <td className={`${tableCls.tdNum} font-semibold text-forest-900`}>
                          {s.physical_quantity === null ? <span title="Unknown until counted" className="font-normal text-muted">—</span> : fmtNum(availableQuantity(s)!)}
                        </td>
                        <td className={tableCls.td}>
                          <StockBadge status={stockStatus(s)} />
                        </td>
                        <td className={`${tableCls.td} hidden whitespace-nowrap text-muted lg:table-cell`}>{s.storage_location ?? "—"}</td>
                        <td className={tableCls.td}>
                          <div className="flex justify-end gap-1.5">
                            {countButton(s)}
                            <ActionMenu label={`More actions for ${seedLabel(s)}`} items={menuFor(s)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <TableFooter shown={seeds.length} total={all.length} />
              </Card>

              {/* Phones and tablets: one card per seed with name, status, figures and the count action */}
              <ul className="grid gap-2 sm:grid-cols-2 xl:hidden">
                {seeds.map((s) => (
                  <li key={s.id} className="rounded-lg border border-sage-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <button className="min-w-0 text-left" onClick={() => setSelectedId(s.id)}>
                        <p className="font-semibold text-forest-900">{s.name}</p>
                        {s.variety && <p className="text-sm text-muted">{s.variety}</p>}
                      </button>
                      <StockBadge status={stockStatus(s)} />
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <MiniFigure label="On hand">
                        {s.physical_quantity === null ? <span className="text-sm font-medium text-amber-800">Not counted</span> : fmtNum(s.physical_quantity)}
                      </MiniFigure>
                      <MiniFigure label="Reserved">{s.physical_quantity === null ? "—" : fmtNum(s.reserved_quantity)}</MiniFigure>
                      <MiniFigure label="Available">{s.physical_quantity === null ? "—" : fmtNum(availableQuantity(s)!)}</MiniFigure>
                    </dl>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted">{s.storage_location ?? s.category}</span>
                      <div className="flex gap-1.5">
                        {countButton(s)}
                        <ActionMenu label={`More actions for ${seedLabel(s)}`} items={menuFor(s)} />
                      </div>
                    </div>
                  </li>
                ))}
                <li className="px-1 text-xs text-muted sm:col-span-2">
                  Showing {fmtNum(seeds.length)} of {fmtNum(all.length)} seeds. Available = on hand − reserved.
                </li>
              </ul>
            </>
          )}
        </>
      )}

      <Drawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={selected ? seedLabel(selected) : ""}
        subtitle={selected && <StockBadge status={stockStatus(selected)} />}
        footer={
          selected && (
            <>
              <Button variant="ghost" className="mr-auto text-red-700 hover:bg-red-50" onClick={() => remove(selected)}>
                <Trash2 /> Delete
              </Button>
              <Button onClick={() => setEditing(selected)}>
                <Pencil /> Edit details
              </Button>
              <Button variant="primary" onClick={() => setCountingId(selected.id)}>
                <ClipboardCheck /> {selected.physical_quantity === null ? "Count stock" : "Recount"}
              </Button>
            </>
          )
        }
      >
        {selected && <SeedDetail seed={selected} />}
      </Drawer>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add seed" : "Edit seed"}>
        {editing !== null && <SeedForm seed={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={counting !== null} onClose={() => setCountingId(null)} title="Record stock count">
        {counting && (
          <StockCountForm
            key={counting.id}
            seed={counting}
            next={nextToCount(counting)}
            onDone={(next) => setCountingId(next?.id ?? null)}
          />
        )}
      </Modal>
      <Modal
        open={importing}
        onClose={() => {
          setImportOpen(false);
          setImportParam(null);
        }}
        title="Import inventory from CSV"
        wide
      >
        {importing && (
          <InventoryImport
            onDone={() => {
              setImportOpen(false);
              setImportParam(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}

function TableFooter({ shown, total }: { shown: number; total: number }) {
  return (
    <p className="border-t border-sage-100 px-4 py-2 text-xs text-muted">
      Showing {fmtNum(shown)} of {fmtNum(total)} seeds. Available = on hand − reserved. Packets are reserved when an order is approved and leave on-hand stock when it&apos;s delivered.
    </p>
  );
}

function MiniFigure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-sage-50 px-2 py-1.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-forest-900">{children}</dd>
    </div>
  );
}

function SeedDetail({ seed }: { seed: Seed }) {
  const counted = seed.physical_quantity !== null;
  return (
    <div className="space-y-5 text-sm">
      <section aria-label="Stock">
        <dl className="grid grid-cols-3 overflow-hidden rounded-lg border border-sage-200">
          <div className="px-3 py-2.5">
            <dt className="text-xs text-muted">On hand</dt>
            <dd className="mt-0.5 text-lg font-semibold text-forest-900">
              <Qty value={seed.physical_quantity} />
            </dd>
          </div>
          <div className="border-l border-sage-200 px-3 py-2.5">
            <dt className="text-xs text-muted">Reserved</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-forest-900">{counted ? fmtNum(seed.reserved_quantity) : "—"}</dd>
          </div>
          <div className="border-l border-sage-200 bg-forest-50/50 px-3 py-2.5">
            <dt className="text-xs text-muted">Available</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-forest-900">{counted ? fmtNum(availableQuantity(seed)!) : "—"}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">
          {counted
            ? "Available = on hand − reserved. Reserved packets belong to approved orders that haven’t been delivered."
            : "This seed hasn’t been counted. Unknown stock isn’t zero, and it can’t be allocated until someone counts it."}
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Details</h3>
        <dl className="divide-y divide-sage-100 rounded-lg border border-sage-200">
          <DetailRow label="Category">{seed.category}</DetailRow>
          <DetailRow label="Storage location">{seed.storage_location ?? "—"}</DetailRow>
          <DetailRow label="Unit">{seed.unit}</DetailRow>
          <DetailRow label="Low-stock alert">{seed.low_stock_threshold === null ? "Not set" : `At ${fmtNum(seed.low_stock_threshold)} available or fewer`}</DetailRow>
          {seed.description && <DetailRow label="Description">{seed.description}</DetailRow>}
          <DetailRow label="Last updated">{fmtDate(seed.updated_at, true)}</DetailRow>
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Stock history</h3>
        <MovementHistory seed={seed} />
      </section>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 px-3 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-forest-900">{children}</dd>
    </div>
  );
}

const intString = z.string().trim().regex(/^\d*$/, "Whole number of 0 or more");
const seedFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  variety: z.string(),
  category: z.enum(CATEGORIES),
  description: z.string(),
  physical: intString,
  notCounted: z.boolean(),
  unit: z.string(),
  storage_location: z.string(),
  low_stock_threshold: intString,
});
type SeedForm = z.infer<typeof seedFormSchema>;
const toInt = (s: string) => (s.trim() === "" ? null : Number(s));

function SeedForm({ seed, onDone }: { seed: Seed | null; onDone: () => void }) {
  const { mutate, toast } = useData();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SeedForm>({
    resolver: zodResolver(seedFormSchema),
    defaultValues: {
      name: seed?.name ?? "",
      variety: seed?.variety ?? "",
      category: seed?.category ?? "Greens",
      description: seed?.description ?? "",
      physical: "",
      notCounted: false,
      unit: seed?.unit ?? "packets",
      storage_location: seed?.storage_location ?? "",
      low_stock_threshold: seed?.low_stock_threshold?.toString() ?? "",
    },
  });
  const notCounted = useWatch({ control, name: "notCounted" });

  async function onSubmit(v: SeedForm) {
    if (!seed && !v.notCounted && v.physical.trim() === "") {
      toast("Enter a quantity, or tick “Not counted yet”.", "error");
      return;
    }
    const body = {
      name: v.name,
      variety: v.variety || null,
      category: v.category,
      description: v.description || null,
      unit: v.unit || "packets",
      storage_location: v.storage_location || null,
      low_stock_threshold: toInt(v.low_stock_threshold),
    };
    try {
      if (seed) await mutate(`/api/seeds/${seed.id}`, body, "PATCH");
      else await mutate("/api/seeds", { ...body, physical_quantity: v.notCounted ? null : toInt(v.physical) });
      toast(seed ? "Seed updated" : `Added ${v.name}`);
      onDone();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
      <Field label="Seed name" error={errors.name?.message}>
        <input className={inputCls} {...register("name")} placeholder="Tomato" autoFocus />
      </Field>
      <Field label="Variety" hint="Optional">
        <input className={inputCls} {...register("variety")} placeholder="Crimson Giant" />
      </Field>
      <Field label="Crop category">
        <select className={inputCls} {...register("category")}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Unit">
        <input className={inputCls} {...register("unit")} />
      </Field>
      {!seed && (
        <div className="sm:col-span-2">
          <Field label="Physical quantity on hand" error={errors.physical?.message} hint="Leave as “not counted” if nobody has counted this seed yet. Unknown is not the same as 0.">
            <div className="flex items-center gap-3">
              <input className={inputCls} inputMode="numeric" {...register("physical")} disabled={notCounted} placeholder="e.g. 40" />
              <label className="flex shrink-0 items-center gap-2 text-sm">
                <input type="checkbox" {...register("notCounted")} className="h-4 w-4 accent-forest-600" /> Not counted yet
              </label>
            </div>
          </Field>
        </div>
      )}
      <Field label="Low-stock threshold" error={errors.low_stock_threshold?.message} hint="Alert when available packets fall to this number">
        <input className={inputCls} inputMode="numeric" {...register("low_stock_threshold")} />
      </Field>
      <Field label="Storage location" hint="Optional">
        <input className={inputCls} {...register("storage_location")} placeholder="Shelf A1" />
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <textarea className={inputCls} rows={2} {...register("description")} />
      </Field>
      {seed && <p className="text-xs text-muted sm:col-span-2">To change quantities, use Count or Recount so the change is recorded in the stock history.</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {seed ? "Save changes" : "Add seed"}
        </Button>
      </div>
    </form>
  );
}

function StockCountForm({ seed, next: nextSeed, onDone }: { seed: Seed; next: Seed | null; onDone: (next: Seed | null) => void }) {
  const { mutate, toast } = useData();
  const [value, setValue] = useState(seed.physical_quantity?.toString() ?? "");
  const [unknown, setUnknown] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = unknown || /^\d+$/.test(value.trim());
  const next = unknown ? null : Number(value);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) return;
    const goNext = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "next";
    setBusy(true);
    try {
      await mutate(`/api/seeds/${seed.id}/stock`, { physical_quantity: next, notes: notes || null });
      toast(`Stock count saved for ${seedLabel(seed)}`);
      onDone(goNext ? nextSeed : null);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-md bg-sage-50 p-3 text-sm">
        <p className="font-medium text-forest-900">{seedLabel(seed)}</p>
        <p className="mt-1 text-muted">
          Currently: <Qty value={seed.physical_quantity} /> on hand · {seed.reserved_quantity} reserved for approved orders
        </p>
      </div>
      <Field
        label="Packets physically on hand"
        error={!valid && value ? "Enter a whole number of 0 or more" : undefined}
        hint={seed.reserved_quantity > 0 ? `Must be at least ${seed.reserved_quantity} (already reserved).` : undefined}
      >
        <input className={inputCls} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} disabled={unknown} autoFocus />
      </Field>
      {seed.physical_quantity !== null && seed.reserved_quantity === 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={unknown} onChange={(e) => setUnknown(e.target.checked)} className="h-4 w-4 accent-forest-600" />
          Mark as not counted (unknown)
        </label>
      )}
      <Field label="Reason or note" hint="Optional, saved in the stock history, e.g. “Recount after spring sort”">
        <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {valid && next !== null && seed.physical_quantity !== null && (
        <p className="text-sm text-muted">
          Change: {next - seed.physical_quantity >= 0 ? "+" : ""}
          {next - seed.physical_quantity} packets · available after: {next - seed.reserved_quantity}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={() => onDone(null)}>
          Cancel
        </Button>
        {nextSeed && (
          <Button type="submit" value="next" disabled={!valid || busy} title={`Then count ${seedLabel(nextSeed)}`}>
            Save and count next
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={!valid || busy}>
          Save count
        </Button>
      </div>
    </form>
  );
}

function MovementHistory({ seed }: { seed: Seed }) {
  const { state } = useData();
  const orders = new Map(state!.snapshot.orders.map((o) => [o.id, o]));
  const moves = state!.snapshot.inventory_movements
    .filter((m) => m.seed_id === seed.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!moves.length) return <p className="rounded-lg border border-dashed border-sage-300 px-3 py-4 text-center text-muted">No stock movements yet.</p>;
  const tone = { initial: "green", adjustment: "blue", reservation: "teal", release: "slate", fulfillment: "amber" } as const;
  return (
    <ol className="divide-y divide-sage-100 rounded-lg border border-sage-200">
      {moves.map((m) => (
        <li key={m.id} className="px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <Badge tone={tone[m.movement_type]}>{MOVEMENT_LABELS[m.movement_type]}</Badge>
            <span className="font-semibold tabular-nums text-forest-900">
              {m.quantity > 0 ? "+" : ""}
              {fmtNum(m.quantity)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {fmtDate(m.created_at, true)} · after: {m.physical_after === null ? "not counted" : `${fmtNum(m.physical_after)} on hand`}, {fmtNum(m.reserved_after)} reserved
          </p>
          {m.notes && (
            <p className="mt-0.5 text-xs text-forest-900">
              {m.order_id && orders.get(m.order_id) ? (
                <Link href={`/requests?id=${m.order_id}`} className="hover:underline">
                  {m.notes}
                </Link>
              ) : (
                m.notes
              )}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function InventoryImport({ onDone }: { onDone: () => void }) {
  const { mutate, toast } = useData();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [existing, setExisting] = useState<"update" | "skip">("update");
  const [results, setResults] = useState<{ row: number; status: string; message: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = rows.map(rowToSeedInput);
  const validCount = parsed.filter((p) => p.input).length;

  function onFile(f: File | undefined) {
    if (!f) return;
    setFileName(f.name);
    setResults(null);
    Papa.parse<Record<string, unknown>>(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (r) => setRows(r.data),
      error: (err) => toast(`Could not read CSV: ${err.message}`, "error"),
    });
  }

  async function submit() {
    setBusy(true);
    try {
      const valid = rows.filter((_, i) => parsed[i].input);
      const res = await mutate<{ results: { row: number; status: string; message: string }[] }>("/api/seeds/import", { rows: valid, existing });
      setResults(res.results);
      const ok = res.results.filter((r) => r.status !== "error").length;
      toast(`Imported ${ok} of ${res.results.length} rows`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">
        Columns: <code className="rounded bg-sage-100 px-1">name, variety, category, physical_quantity, unit, storage_location, low_stock_threshold, description</code>. Leave{" "}
        <code className="rounded bg-sage-100 px-1">physical_quantity</code> blank for seeds that haven&apos;t been counted.{" "}
        <a className="font-medium text-forest-700 underline" href="/templates/inventory-template.csv" download>
          Download template
        </a>
      </p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-forest-50 file:px-3 file:py-2 file:font-medium file:text-forest-800" />
      {rows.length > 0 && !results && (
        <>
          <p>
            <strong>{fileName}</strong>: {rows.length} rows, {validCount} valid
            {rows.length - validCount > 0 && <span className="text-red-700">, {rows.length - validCount} with errors (will be skipped)</span>}.
          </p>
          <div className="max-h-64 overflow-auto rounded-md border border-sage-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-sage-50 text-left text-muted">
                <tr>
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Seed</th>
                  <th className="px-2 py-1.5">Category</th>
                  <th className="px-2 py-1.5 text-right">Qty</th>
                  <th className="px-2 py-1.5">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sage-100">
                {parsed.map((p, i) => (
                  <tr key={i} className={p.input ? "" : "bg-red-50"}>
                    <td className="px-2 py-1.5 text-muted">{i + 1}</td>
                    <td className="px-2 py-1.5">{p.input ? seedLabel({ name: p.input.name, variety: p.input.variety ?? null }) : String(rows[i].name ?? "")}</td>
                    <td className="px-2 py-1.5">{p.input?.category}</td>
                    <td className="px-2 py-1.5 text-right">{p.input ? <Qty value={p.input.physical_quantity ?? null} /> : ""}</td>
                    <td className="px-2 py-1.5">{p.input ? "OK" : <span className="text-red-700">{p.errors.join("; ")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Field label="If a seed already exists">
            <select className={inputCls} value={existing} onChange={(e) => setExisting(e.target.value as "update" | "skip")}>
              <option value="update">Update its details and stock count (recorded as an adjustment)</option>
              <option value="skip">Skip it</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={onDone}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={!validCount || busy}>
              Import {validCount} rows
            </Button>
          </div>
        </>
      )}
      {results && (
        <>
          <ul className="max-h-64 divide-y divide-sage-100 overflow-auto rounded-md border border-sage-200">
            {results.map((r) => (
              <li key={r.row} className="flex justify-between gap-3 px-3 py-1.5 text-xs">
                <span>{r.message}</span>
                <Badge tone={r.status === "error" ? "red" : r.status === "skipped" ? "gray" : "green"}>{r.status}</Badge>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onDone}>
              Done
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
