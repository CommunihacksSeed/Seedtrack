"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Papa from "papaparse";
import { ClipboardCheck, Download, History, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { useData } from "@/components/data-provider";
import { downloadExport } from "@/components/download";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageHeader,
  Qty,
  StockBadge,
  fmtDate,
  inputCls,
} from "@/components/ui";
import { availableQuantity, seedLabel, stockStatus } from "@/lib/domain";
import { CATEGORIES, MOVEMENT_LABELS, type Seed, type StockStatus } from "@/lib/types";
import { rowToSeedInput } from "@/lib/import-mapping";

const STOCK_FILTERS: ("All" | StockStatus)[] = ["All", "Available", "Low Stock", "Out of Stock", "Needs Stock Count"];

export default function InventoryPage() {
  const { state, mutate, toast } = useData();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [stock, setStock] = useState<(typeof STOCK_FILTERS)[number]>("All");
  const [editing, setEditing] = useState<Seed | "new" | null>(null);
  const [counting, setCounting] = useState<Seed | null>(null);
  const [history, setHistory] = useState<Seed | null>(null);
  const [importing, setImporting] = useState(false);

  const seeds = useMemo(() => {
    if (!state) return [];
    const needle = q.trim().toLowerCase();
    return state.snapshot.seeds
      .filter((s) => (cat === "All" || s.category === cat) && (stock === "All" || stockStatus(s) === stock))
      .filter((s) => !needle || `${seedLabel(s)} ${s.storage_location ?? ""} ${s.category}`.toLowerCase().includes(needle))
      .sort((a, b) => seedLabel(a).localeCompare(seedLabel(b)));
  }, [state, q, cat, stock]);

  if (!state) return <Loading />;
  const staff = state.staff;

  async function remove(s: Seed) {
    if (!confirm(`Delete ${seedLabel(s)} from inventory? This can't be undone.`)) return;
    try {
      await mutate(`/api/seeds/${s.id}`, undefined, "DELETE");
      toast(`Deleted ${seedLabel(s)}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Seed Inventory"
        subtitle={
          <>
            Physical stock, reserved packets and what&apos;s available to allocate.{" "}
            {state.demo && <strong className="text-amber-800">Quantities are fictional demo data.</strong>}
          </>
        }
        actions={
          <>
            <Button onClick={() => downloadExport("inventory").catch((e) => toast(e.message, "error"))}>
              <Download size={16} /> Export CSV
            </Button>
            <Button onClick={() => setImporting(true)} disabled={!staff}>
              <Upload size={16} /> Import CSV
            </Button>
            <Button variant="primary" onClick={() => setEditing("new")} disabled={!staff}>
              <Plus size={16} /> Add seed
            </Button>
          </>
        }
      />

      <Card className="mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className={`${inputCls} pl-9`} placeholder="Search seeds, varieties, locations…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search seeds" />
        </div>
        <select className={`${inputCls} sm:w-56`} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category">
          <option value="All">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className={`${inputCls} sm:w-48`} value={stock} onChange={(e) => setStock(e.target.value as typeof stock)} aria-label="Filter by stock status">
          {STOCK_FILTERS.map((c) => (
            <option key={c} value={c}>
              {c === "All" ? "All stock levels" : c}
            </option>
          ))}
        </select>
      </Card>

      {seeds.length === 0 ? (
        <EmptyState title={state.snapshot.seeds.length ? "No seeds match these filters" : "No inventory yet"}>
          {state.snapshot.seeds.length ? "Try clearing the search." : "Add seeds one by one or import a CSV to build the inventory from scratch."}
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-sage-50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Seed</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 text-right font-medium">Physical</th>
                <th className="px-4 py-3 text-right font-medium">Reserved</th>
                <th className="px-4 py-3 text-right font-medium">Available</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-100">
              {seeds.map((s) => (
                <tr key={s.id} className="hover:bg-sage-50/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-forest-900">{s.name}</p>
                    {s.variety && <p className="text-xs text-muted">{s.variety}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted">{s.category}</td>
                  <td className="px-4 py-3 text-right">
                    <Qty value={s.physical_quantity} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.physical_quantity === null ? "—" : s.reserved_quantity}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    <Qty value={availableQuantity(s)} unknownLabel="Unknown" />
                  </td>
                  <td className="px-4 py-3">
                    <StockBadge status={stockStatus(s)} />
                  </td>
                  <td className="px-4 py-3 text-muted">{s.storage_location ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant={s.physical_quantity === null ? "primary" : "secondary"} onClick={() => setCounting(s)} disabled={!staff}>
                        <ClipboardCheck size={14} /> {s.physical_quantity === null ? "Count" : "Update"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setHistory(s)} aria-label={`History for ${seedLabel(s)}`}>
                        <History size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s)} disabled={!staff} aria-label={`Edit ${seedLabel(s)}`}>
                        <Pencil size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(s)} disabled={!staff} aria-label={`Delete ${seedLabel(s)}`}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-sage-100 px-4 py-2 text-xs text-muted">
            Available = physical − reserved. Packets are reserved when an order is approved and deducted from physical stock when it&apos;s delivered.
          </p>
        </Card>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add seed" : "Edit seed"}>
        {editing !== null && <SeedForm seed={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={counting !== null} onClose={() => setCounting(null)} title="Record stock count">
        {counting && <StockCountForm seed={counting} onDone={() => setCounting(null)} />}
      </Modal>
      <Modal open={history !== null} onClose={() => setHistory(null)} title={history ? `History — ${seedLabel(history)}` : ""} wide>
        {history && <MovementHistory seed={history} />}
      </Modal>
      <Modal open={importing} onClose={() => setImporting(false)} title="Import inventory from CSV" wide>
        {importing && <InventoryImport onDone={() => setImporting(false)} />}
      </Modal>
    </>
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
      {seed && <p className="text-xs text-muted sm:col-span-2">To change quantities, use “Update” on the inventory row so the change is recorded in the stock history.</p>}
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

function StockCountForm({ seed, onDone }: { seed: Seed; onDone: () => void }) {
  const { mutate, toast } = useData();
  const [value, setValue] = useState(seed.physical_quantity?.toString() ?? "");
  const [unknown, setUnknown] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = unknown || /^\d+$/.test(value.trim());
  const next = unknown ? null : Number(value);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await mutate(`/api/seeds/${seed.id}/stock`, { physical_quantity: next, notes: notes || null });
      toast(`Stock count saved for ${seedLabel(seed)}`);
      onDone();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl bg-sage-50 p-3 text-sm">
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
      <Field label="Note" hint="Optional, e.g. “Recount after spring sort”">
        <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {valid && next !== null && seed.physical_quantity !== null && (
        <p className="text-sm text-muted">
          Change: {next - seed.physical_quantity >= 0 ? "+" : ""}
          {next - seed.physical_quantity} packets · available after: {next - seed.reserved_quantity}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onDone}>
          Cancel
        </Button>
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
  if (!moves.length) return <EmptyState title="No stock movements yet">This seed hasn&apos;t been counted.</EmptyState>;
  const tone = { initial: "green", adjustment: "blue", reservation: "teal", release: "slate", fulfillment: "amber" } as const;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="py-2 font-medium">When</th>
          <th className="py-2 font-medium">Movement</th>
          <th className="py-2 text-right font-medium">Change</th>
          <th className="py-2 text-right font-medium">Physical / reserved after</th>
          <th className="py-2 pl-4 font-medium">Notes</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-sage-100">
        {moves.map((m) => (
          <tr key={m.id}>
            <td className="py-2 text-muted">{fmtDate(m.created_at, true)}</td>
            <td className="py-2">
              <Badge tone={tone[m.movement_type]}>{MOVEMENT_LABELS[m.movement_type]}</Badge>
            </td>
            <td className="py-2 text-right tabular-nums">
              {m.quantity > 0 ? "+" : ""}
              {m.quantity}
            </td>
            <td className="py-2 text-right tabular-nums">
              {m.physical_after ?? "?"} / {m.reserved_after}
            </td>
            <td className="py-2 pl-4 text-muted">
              {m.order_id && orders.get(m.order_id) ? (
                <Link href={`/requests/${m.order_id}`} className="hover:text-forest-700 hover:underline">
                  {m.notes}
                </Link>
              ) : (
                m.notes
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
          <div className="max-h-64 overflow-auto rounded-xl border border-sage-200">
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
          <ul className="max-h-64 divide-y divide-sage-100 overflow-auto rounded-xl border border-sage-200">
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
