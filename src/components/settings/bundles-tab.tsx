"use client";

import { useState } from "react";
import { Boxes, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useData } from "@/components/data-provider";
import { Button, Card, CardHeader, EmptyState, Field, Modal, inputCls } from "@/components/ui";
import { describeRule } from "@/lib/allocation";
import { seedLabel } from "@/lib/domain";
import type { AppSettings, Bundle } from "@/lib/types";

export function BundlesTab() {
  const { state, mutate, toast } = useData();
  const db = state!.snapshot;
  const staff = state!.staff;
  const seeds = new Map(db.seeds.map((s) => [s.id, s]));
  const [editing, setEditing] = useState<Bundle | "new" | null>(null);

  async function remove(b: Bundle) {
    if (!confirm(`Delete the "${b.name}" bundle template? Existing orders are not affected.`)) return;
    try {
      await mutate(`/api/bundles/${b.id}`, undefined, "DELETE");
      toast(`Deleted ${b.name}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Bundle templates"
          subtitle="What each bundle contains. During review, one click adds a bundle's seeds to a request."
          action={
            <Button size="sm" variant="primary" onClick={() => setEditing("new")} disabled={!staff}>
              <Plus size={14} /> New bundle
            </Button>
          }
        />
        {db.bundles.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No bundles yet">Add one for each bundle on the request form (e.g. Spring, Fall Harvest, Herbs).</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-sage-100">
            {db.bundles.map((b) => (
              <li key={b.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium text-forest-900">
                    <Boxes size={15} className="text-forest-500" /> {b.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {b.items.length
                      ? b.items.map((i) => `${seeds.get(i.seed_id) ? seedLabel(seeds.get(i.seed_id)!) : "?"} × ${i.quantity}`).join(" · ")
                      : "Empty"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(b)} disabled={!staff} aria-label={`Edit ${b.name}`}>
                    <Pencil size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(b)} disabled={!staff} aria-label={`Delete ${b.name}`}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AllocationCard key={JSON.stringify(db.settings.allocation)} rule={db.settings.allocation} />

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New bundle" : "Edit bundle"}>
        {editing !== null && <BundleForm bundle={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function BundleForm({ bundle, onDone }: { bundle: Bundle | null; onDone: () => void }) {
  const { state, mutate, toast } = useData();
  const seeds = [...state!.snapshot.seeds].sort((a, b) => seedLabel(a).localeCompare(seedLabel(b)));
  const [name, setName] = useState(bundle?.name ?? "");
  const [description, setDescription] = useState(bundle?.description ?? "");
  const [rows, setRows] = useState(bundle?.items.map((i) => ({ seed_id: i.seed_id, quantity: String(i.quantity) })) ?? [{ seed_id: "", quantity: "1" }]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const items = rows.filter((r) => r.seed_id).map((r) => ({ seed_id: r.seed_id, quantity: Number(r.quantity) }));
    if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1)) return toast("Quantities must be whole numbers of 1 or more.", "error");
    setBusy(true);
    try {
      await mutate(bundle ? `/api/bundles/${bundle.id}` : "/api/bundles", { name, description: description || null, items }, bundle ? "PATCH" : "POST");
      toast(bundle ? "Bundle saved" : `Created ${name}`);
      onDone();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-sm">
      <Field label="Bundle name" hint="Use the same name as on the request form so it's recognized automatically.">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Spring" />
      </Field>
      <Field label="Description" hint="Optional">
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div>
        <p className="mb-1 font-medium text-forest-900">Seeds and packets</p>
        <div className="space-y-2">
          {rows.map((r, idx) => (
            <div key={idx} className="flex gap-2">
              <select
                className={inputCls}
                value={r.seed_id}
                onChange={(e) => setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, seed_id: e.target.value } : x)))}
                aria-label={`Seed ${idx + 1}`}
              >
                <option value="">— Choose seed —</option>
                {seeds.map((s) => (
                  <option key={s.id} value={s.id} disabled={rows.some((x, i) => i !== idx && x.seed_id === s.id)}>
                    {seedLabel(s)}
                  </option>
                ))}
              </select>
              <input
                className={`${inputCls} w-20 text-right`}
                inputMode="numeric"
                value={r.quantity}
                onChange={(e) => setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))}
                aria-label={`Packets ${idx + 1}`}
              />
              <Button type="button" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))} aria-label="Remove seed">
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" size="sm" className="mt-2" onClick={() => setRows((rs) => [...rs, { seed_id: "", quantity: "1" }])}>
          <Plus size={14} /> Add seed
        </Button>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
          Save bundle
        </Button>
      </div>
    </form>
  );
}

function AllocationCard({ rule }: { rule: AppSettings["allocation"] }) {
  const { state, mutate, toast } = useData();
  const [draft, setDraft] = useState({
    mode: rule.mode,
    fixed: String(rule.fixed),
    students_per_packet: String(rule.students_per_packet),
    min: String(rule.min),
    max: String(rule.max),
  });
  const [busy, setBusy] = useState(false);
  const num = (k: "fixed" | "students_per_packet" | "min" | "max") => (
    <input
      className={`${inputCls} w-20 text-right`}
      inputMode="numeric"
      value={draft[k]}
      onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
      aria-label={k.replace(/_/g, " ")}
    />
  );

  async function save() {
    setBusy(true);
    try {
      await mutate(
        "/api/settings",
        {
          allocation: {
            mode: draft.mode,
            fixed: Number(draft.fixed),
            students_per_packet: Number(draft.students_per_packet),
            min: Number(draft.min),
            max: Number(draft.max),
          },
        },
        "PATCH",
      );
      toast("Suggestion rule saved");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Suggested quantities"
        subtitle="When a requester doesn't say how many packets, pre-fill a suggestion. Staff still confirm each one."
        action={<Sparkles size={18} className="text-forest-500" />}
      />
      <div className="space-y-4 p-5 text-sm">
        {(
          [
            ["none", "No suggestion", "Staff type every quantity."],
            ["fixed", "Same amount for every variety", null],
            ["per_students", "Based on number of students", null],
          ] as const
        ).map(([mode, label, hint]) => (
          <label key={mode} className="flex cursor-pointer items-start gap-3 rounded-xl border border-sage-200 p-3 has-[:checked]:border-forest-400 has-[:checked]:bg-forest-50/50">
            <input type="radio" name="mode" className="mt-1 accent-forest-600" checked={draft.mode === mode} onChange={() => setDraft((d) => ({ ...d, mode }))} />
            <span className="flex-1">
              <span className="block font-medium text-forest-900">{label}</span>
              {hint && <span className="text-xs text-muted">{hint}</span>}
              {mode === "fixed" && draft.mode === "fixed" && <span className="mt-2 flex items-center gap-2">{num("fixed")} packets per variety</span>}
              {mode === "per_students" && draft.mode === "per_students" && (
                <span className="mt-2 flex items-center gap-2">1 packet per {num("students_per_packet")} students</span>
              )}
            </span>
          </label>
        ))}
        {draft.mode !== "none" && (
          <p className="flex flex-wrap items-center gap-2">
            Keep each suggestion between {num("min")} and {num("max")} packets.
          </p>
        )}
        <p className="text-xs text-muted">Current rule: {describeRule(rule)}</p>
        <div className="flex justify-end">
          <Button variant="primary" onClick={save} disabled={!state!.staff || busy}>
            Save rule
          </Button>
        </div>
      </div>
    </Card>
  );
}
