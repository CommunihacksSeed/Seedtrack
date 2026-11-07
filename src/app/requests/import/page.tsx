"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Papa from "papaparse";
import { ArrowLeft, FileUp, RefreshCw } from "lucide-react";
import { useData } from "@/components/data-provider";
import { Badge, Button, Card, CardHeader, Field, Loading, PageHeader, inputCls, LinkButton } from "@/components/ui";
import { REQUEST_FIELDS, guessMapping, rowToOrderInput, type Mapping, type RequestField } from "@/lib/import-mapping";

type Result = { row: number; status: string; message: string; order_number?: number };

export default function ImportRequestsPage() {
  const { state, mutate, toast } = useData();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [fileName, setFileName] = useState("");
  const [source, setSource] = useState("cognito-import");
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);

  const existingIds = useMemo(
    () => new Set(state?.snapshot.orders.map((o) => o.external_entry_id).filter(Boolean) as string[]),
    [state],
  );
  const preview = useMemo(() => rows.map((r) => rowToOrderInput(r, mapping, source)), [rows, mapping, source]);
  const seenInFile = new Map<string, number>();
  const annotated = preview.map((p, i) => {
    const ext = p.input?.external_entry_id;
    let dup: string | null = null;
    if (ext && existingIds.has(ext)) dup = "Already imported";
    else if (ext && seenInFile.has(ext)) dup = `Duplicate of row ${seenInFile.get(ext)! + 1}`;
    if (ext && !seenInFile.has(ext)) seenInFile.set(ext, i);
    return { ...p, dup };
  });
  const importable = annotated.filter((a) => a.input && !a.dup);

  if (!state) return <Loading />;

  function load(data: Record<string, unknown>[], name: string) {
    const hs = [...new Set(data.flatMap((r) => Object.keys(r)))];
    setRows(data);
    setHeaders(hs);
    setMapping(guessMapping(hs));
    setFileName(name);
    setResults(null);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.name.toLowerCase().endsWith(".json")) {
      try {
        const parsed = JSON.parse(await f.text());
        const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.entries) ? parsed.entries : [parsed];
        load(list.map(flatten), f.name);
      } catch {
        toast("That JSON file couldn't be read.", "error");
      }
      return;
    }
    Papa.parse<Record<string, unknown>>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => load(r.data, f.name),
      error: (err) => toast(`Could not read CSV: ${err.message}`, "error"),
    });
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await mutate<{ results: Result[] }>("/api/orders/import", { orders: importable.map((a) => a.input) });
      setResults(res.results);
      const ok = res.results.filter((r) => r.status === "imported").length;
      toast(`Imported ${ok} request${ok === 1 ? "" : "s"}`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link href="/requests" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-forest-700">
        <ArrowLeft size={14} /> Seed Requests
      </Link>
      <PageHeader
        title="Import seed requests"
        subtitle="Upload a Cognito Forms export (CSV or JSON). You'll map columns and check every row before anything is saved."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="1. Choose a file" />
            <div className="space-y-3 p-5 text-sm">
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-sage-200 bg-sage-50/60 px-4 py-8 text-center hover:border-forest-300">
                <FileUp className="text-forest-500" />
                <span className="font-medium text-forest-900">{fileName || "Click to choose a .csv or .json file"}</span>
                <input type="file" accept=".csv,.json,text/csv,application/json" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <p className="text-xs text-muted">
                Need an example?{" "}
                <a className="font-medium text-forest-700 underline" href="/templates/requests-template.csv" download>
                  CSV template
                </a>{" "}
                ·{" "}
                <a className="font-medium text-forest-700 underline" href="/templates/requests-sample.json" download>
                  JSON sample
                </a>
                . Seeds can include quantities like <code>Kale x5</code> or <code>Kale (5)</code>; plain names import with the quantity unspecified.
              </p>
              <Field label="Record source as">
                <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="cognito-import">Cognito Forms export</option>
                  <option value="csv">Other CSV / spreadsheet</option>
                  <option value="json">JSON</option>
                </select>
              </Field>
            </div>
          </Card>

          {headers.length > 0 && (
            <Card>
              <CardHeader
                title="2. Map columns"
                subtitle="We guessed from the column names. Check each one: Cognito export names may differ."
                action={
                  <Button size="sm" variant="ghost" onClick={() => setMapping(guessMapping(headers))}>
                    <RefreshCw size={13} /> Re-guess
                  </Button>
                }
              />
              <div className="grid gap-3 p-5">
                {REQUEST_FIELDS.map((f) => (
                  <div key={f.key} className="grid grid-cols-[1fr_1.2fr] items-center gap-3 text-sm">
                    <span className="text-forest-900">
                      {f.label}
                      {f.required && <span className="text-red-700"> *</span>}
                    </span>
                    <select
                      className={inputCls}
                      value={mapping[f.key] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key as RequestField]: e.target.value || undefined }))}
                      aria-label={`Column for ${f.label}`}
                    >
                      <option value="">— not in file —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {rows.length > 0 && (
          <Card className="self-start">
            <CardHeader
              title={results ? "4. Import results" : "3. Preview & validate"}
              subtitle={
                results
                  ? undefined
                  : `${rows.length} rows · ${importable.length} ready · ${annotated.filter((a) => !a.input).length} with errors · ${annotated.filter((a) => a.dup).length} duplicates`
              }
            />
            <div className="max-h-[60vh] overflow-auto">
              {results ? (
                <ul className="divide-y divide-sage-100">
                  {results.map((r) => (
                    <li key={r.row} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      <span>
                        {r.order_number && r.status === "imported" ? (
                          <Link href={`/requests/${state.snapshot.orders.find((o) => o.order_number === r.order_number)?.id ?? ""}`} className="font-medium text-forest-700 hover:underline">
                            #{r.order_number}
                          </Link>
                        ) : null}{" "}
                        {r.message}
                      </span>
                      <Badge tone={r.status === "imported" ? "green" : r.status === "duplicate" ? "gray" : "red"}>{r.status}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-sage-50 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">#</th>
                      <th className="px-4 py-2 font-medium">Request</th>
                      <th className="px-4 py-2 font-medium">Seeds</th>
                      <th className="px-4 py-2 font-medium">Check</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sage-100">
                    {annotated.map((a, i) => (
                      <tr key={i} className={!a.input ? "bg-red-50/60" : a.dup ? "bg-stone-50" : ""}>
                        <td className="px-4 py-2 align-top text-muted">{i + 1}</td>
                        <td className="px-4 py-2 align-top">
                          {a.input ? (
                            <>
                              <p className="font-medium">{a.input.organization_name}</p>
                              <p className="text-xs text-muted">
                                {a.input.requester_name}
                                {a.input.external_entry_id && ` · entry ${a.input.external_entry_id}`}
                              </p>
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 align-top text-xs">
                          {a.input?.items.map((it) => `${it.requested_seed_name}${it.requested_quantity !== null ? ` ×${it.requested_quantity}` : ""}`).join(", ")}
                          {a.input?.requested_bundles?.length ? <span className="block text-muted">Bundles: {a.input.requested_bundles.join(", ")}</span> : null}
                        </td>
                        <td className="px-4 py-2 align-top">
                          {!a.input ? (
                            <span className="text-xs text-red-700">{a.errors.join("; ")}</span>
                          ) : a.dup ? (
                            <Badge tone="gray">{a.dup}</Badge>
                          ) : (
                            <Badge tone="green">Ready</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-sage-100 p-4">
              {results ? (
                <LinkButton href="/requests" variant="primary">Go to requests</LinkButton>
              ) : (
                <Button variant="primary" onClick={submit} disabled={busy || importable.length === 0}>
                  Import {importable.length} request{importable.length === 1 ? "" : "s"}
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

/** Flatten nested JSON objects ("Address": {"City": …} → "Address.City"). Arrays are kept. */
function flatten(obj: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
      else out[key] = v;
    }
  }
  return out;
}
