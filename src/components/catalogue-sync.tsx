"use client";

import { useEffect, useState } from "react";
import { useData } from "./data-provider";
import { Badge, Button } from "./ui";
import { seedIdentity, seedLabel } from "@/lib/domain";
import type { CatalogueExport } from "@/lib/seed-catalogue";

type ImportResult = { row: number; status: "created" | "skipped" | "error"; message: string };

export function CatalogueSync({ onDone }: { onDone: () => void }) {
  const { state, mutate, toast } = useData();
  const [preview, setPreview] = useState<CatalogueExport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/seeds/catalogue", { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load the catalogue.");
        setPreview(data);
      } catch (error) {
        if (!controller.signal.aborted) setError((error as Error).message);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const inventory = new Set(state?.snapshot.seeds.map(seedIdentity));
  const rows = (preview?.rows ?? []).map((seed) => ({ seed, existing: inventory.has(seedIdentity(seed)) }))
    .sort((a, b) => Number(a.existing) - Number(b.existing));
  const additions = rows.filter((row) => !row.existing).map((row) => row.seed);

  async function apply() {
    if (busy || !additions.length) return;
    setBusy(true);
    setError("");
    try {
      const { results } = await mutate<{ results: ImportResult[] }>("/api/seeds/import", {
        rows: additions,
        existing: "skip",
      });
      setResults(results);
      toast(`Added ${results.filter((r) => r.status === "created").length} catalogue seeds.`);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (results) {
    const skipped = results.filter((r) => r.status === "skipped").length;
    const failures = results.filter((r) => r.status === "error");
    return (
      <div className="space-y-4 text-sm">
        <p role="status">{results.filter((r) => r.status === "created").length} added with stock unknown. {skipped} already in inventory.</p>
        {failures.length > 0 && (
          <ul className="list-disc pl-5 text-red-700">
            {failures.map((r) => <li key={r.row}>{r.message}</li>)}
          </ul>
        )}
        <Button variant="primary" onClick={onDone}>Done</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">Add new entries from the YFS Google Docs catalogue with stock unknown. Existing inventory is skipped.</p>
      {error && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-red-800">
          <p>{error}</p>
          {!preview && <p className="mt-1">If the export stays unavailable, use Import CSV with a copy of the catalogue and select Skip it for existing seeds.</p>}
        </div>
      )}
      {!preview && !error && <p role="status">Reading the catalogue…</p>}
      {preview && (
        <>
          <p><strong>{additions.length} new</strong> · {rows.length - additions.length} existing · {preview.unrecognized.length} unrecognized</p>
          <div className="max-h-64 overflow-auto rounded-md border border-sage-200" tabIndex={0} role="region" aria-label="Catalogue preview">
            <ul className="divide-y divide-sage-100">
              {preview.unrecognized.map((line, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 wrap-anywhere">{line}</span>
                  <Badge tone="amber">Unrecognized</Badge>
                </li>
              ))}
              {rows.map(({ seed, existing }) => (
                <li key={seedIdentity(seed)} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 wrap-anywhere">
                    {seedLabel({ name: seed.name, variety: seed.variety ?? null })}
                    <span className="block text-xs text-muted">{seed.category}</span>
                  </span>
                  <Badge tone={existing ? "gray" : "green"}>{existing ? "Existing" : "New"}</Badge>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onDone}>{additions.length ? "Cancel" : "Close"}</Button>
        {additions.length > 0 && <Button variant="primary" onClick={apply} disabled={busy}>{busy ? "Adding…" : `Add ${additions.length} new ${additions.length === 1 ? "seed" : "seeds"}`}</Button>}
      </div>
    </div>
  );
}
