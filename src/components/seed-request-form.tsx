"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Boxes, CalendarDays, Check, ChevronDown, Loader2, Sprout, X } from "lucide-react";
import { Button, Card, Field, SearchInput, inputCls } from "@/components/ui";
import { availableQuantity, seedLabel } from "@/lib/domain";
import { CATEGORIES, type OrderInput, type Seed } from "@/lib/types";
import { SEASON } from "@/lib/season";

/**
 * The YFS seed request form, shared by the public link (/request) and the
 * staff "New request" page: your information → seed request details
 * (bundles, seed types by category) → details concerning your order.
 * Seeds are picked from inventory, so each request line is matched from the
 * start; packet counts are optional.
 */
export type FormSeed = Pick<Seed, "id" | "name" | "variety" | "category" | "physical_quantity" | "reserved_quantity">;
export type FormBundle = { id: string; name: string; description: string | null; items: { seed_id: string }[] };
export type SeedRequestPayload = Omit<OrderInput, "source" | "external_entry_id" | "submitted_at">;
type YesNo = "" | "yes" | "no";
type Donate = "" | "yes" | "help" | "no";
const yn = (v: YesNo) => (v === "yes" ? true : v === "no" ? false : null);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export function SeedRequestForm({
  seeds: allSeeds,
  bundleOptions,
  header,
  submitLabel = "Submit request",
  onSubmit,
}: {
  seeds: FormSeed[];
  bundleOptions: FormBundle[];
  header?: React.ReactNode;
  submitLabel?: string;
  /** Throw an Error with a readable message to show it under the form. */
  onSubmit: (payload: SeedRequestPayload) => Promise<void>;
}) {
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const errorRef = useRef<HTMLDivElement>(null);
  const [f, setF] = useState({
    name: "",
    email: "",
    org: "",
    address: "",
    schoolUse: "" as YesNo,
    students: "",
    special: "",
    wantsBundles: "" as YesNo,
    gardenSupport: "" as YesNo,
    supportType: "",
    donate: "" as Donate,
    website: "", // honeypot: hidden from people, bots fill it in
  });
  const [bundles, setBundles] = useState<string[]>([]);
  /** seed id → packets as typed ("" = not specified) */
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const byCategory = useMemo(() => {
    const seeds = [...allSeeds].sort((a, b) => seedLabel(a).localeCompare(seedLabel(b)));
    return CATEGORIES.map((c) => ({ category: c, seeds: seeds.filter((s) => s.category === c) })).filter((g) => g.seeds.length > 0);
  }, [allSeeds]);
  const seedById = useMemo(() => new Map(allSeeds.map((s) => [s.id, s])), [allSeeds]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const errors = {
    name: !f.name.trim() ? "Please enter your name" : undefined,
    org: !f.org.trim() ? (f.schoolUse === "yes" ? "Please enter the school" : "Please enter your school or organization") : undefined,
    email: f.email.trim() && !isEmail(f.email.trim()) ? "That email doesn’t look right" : undefined,
    students: f.students.trim() && !/^\d+$/.test(f.students.trim()) ? "Use a whole number" : undefined,
    qty: Object.values(picked).some((v) => v.trim() && !/^\d+$/.test(v.trim())) ? "Packet counts must be whole numbers" : undefined,
    nothing:
      (f.wantsBundles === "yes" ? bundles.length : 0) === 0 && Object.keys(picked).length === 0 ? "Choose at least one bundle or seed type" : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);
  const pickedCount = Object.keys(picked).length;
  const needle = q.trim().toLowerCase();

  const toggleSeed = (s: FormSeed) =>
    setPicked((p) => {
      const next = { ...p };
      if (s.id in next) delete next[s.id];
      else next[s.id] = "";
      return next;
    });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setFormErrors([]);
    if (!valid) {
      setFormErrors(Object.values(errors).filter((m): m is string => Boolean(m)));
      requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        requester_name: f.name.trim(),
        requester_email: f.email.trim() || null,
        organization_name: f.org.trim(),
        mailing_address: f.address.trim() || null,
        school_use: yn(f.schoolUse),
        student_count: f.students.trim() ? Number(f.students) : null,
        requested_bundles: f.wantsBundles === "yes" ? bundles : [],
        special_requests:
          [
            f.special.trim(),
            f.donate === "help" ? "Seed donation: yes, but needs help learning how to save seeds." : "",
            f.gardenSupport === "yes" && f.supportType.trim() ? `Garden support wanted: ${f.supportType.trim()}` : "",
          ]
            .filter(Boolean)
            .join("\n") || null,
        garden_support: yn(f.gardenSupport),
        seed_donation_interest: f.donate === "" ? null : f.donate !== "no",
        items: Object.entries(picked).map(([id, qty]) => ({
          seed_id: id,
          requested_seed_name: seedLabel(seedById.get(id)!),
          requested_quantity: qty.trim() ? Number(qty) : null,
        })),
        ...(f.website ? { website: f.website } : {}),
      } as SeedRequestPayload);
    } catch (err) {
      setFormErrors([(err as Error).message]);
      requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-3xl pb-24">
      {header}
      {/* Honeypot: hidden from people and screen readers; bots tend to fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} />
        </label>
      </div>

      <Card className="mt-4 border-amber-200 bg-amber-50/60 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold text-forest-900">
          <CalendarDays size={16} aria-hidden /> {SEASON.applicationsOpen ? SEASON.label : "Please confirm current deadlines with YFS"}
        </p>
        {!SEASON.applicationsOpen && (
          <p className="mt-1.5 text-forest-900/80">
            The dates below are from the {SEASON.label} and have passed. Submitting this form does not guarantee seeds; staff will confirm what is available.
          </p>
        )}
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-forest-900/80">
          <li>
            {SEASON.applicationsOpen ? "Best to request before" : "Recommended request date was"} <strong>{SEASON.recommendedDeadline}</strong>
            {SEASON.applicationsOpen ? " so Seed Stewards can fill and mail orders." : "."}
          </li>
          <li>
            {SEASON.applicationsOpen ? "Requests are accepted until" : "Final deadline was"} <strong>{SEASON.finalDeadline}</strong>; seeds{" "}
            {SEASON.applicationsOpen ? "are mailed or delivered from" : "started going out"} <strong>{SEASON.distributionStart}</strong>.
          </li>
          <li>
            Questions: <a className="underline" href={`mailto:${SEASON.contactEmail}`}>{SEASON.contactEmail}</a>
          </li>
        </ul>
      </Card>

      <Section n={1} title="Your information">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name *" error={tried ? errors.name : undefined}>
            <input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Email" error={tried ? errors.email : undefined}>
            <input className={inputCls} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
          </Field>
          <YesNoField label="Are these seeds for school use?" value={f.schoolUse} onChange={(v) => set("schoolUse", v)} />
          <Field label={f.schoolUse === "yes" ? "What school are these seeds for? *" : "School, group or organization *"} error={tried ? errors.org : undefined}>
            <input className={inputCls} value={f.org} onChange={(e) => set("org", e.target.value)} autoComplete="organization" />
          </Field>
          <Field label="Mailing address" className="sm:col-span-2">
            <textarea className={inputCls} rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} autoComplete="street-address" />
          </Field>
        </div>
      </Section>

      <Section n={2} title="Seed request details">
        <YesNoField label="Would you like to select any seed bundles?" value={f.wantsBundles} onChange={(v) => set("wantsBundles", v)} />
        {f.wantsBundles === "yes" &&
          (bundleOptions.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No bundles are available right now. Pick seed types below instead.</p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {bundleOptions.map((b) => {
                const on = bundles.includes(b.name);
                const seeds = seedById;
                return (
                  <button
                    type="button"
                    key={b.id}
                    aria-pressed={on}
                    onClick={() => setBundles((x) => (on ? x.filter((n) => n !== b.name) : [...x, b.name]))}
                    className={clsx(
                      "rounded-lg border p-3 text-left transition-colors",
                      on ? "border-forest-500 bg-forest-50 ring-1 ring-forest-500" : "border-sage-200 bg-white hover:bg-sage-50",
                    )}
                  >
                    <span className="flex items-center gap-2 font-medium text-forest-900">
                      <span className={clsx("grid h-4 w-4 place-items-center rounded border", on ? "border-forest-600 bg-forest-600 text-white" : "border-stone-300")}>
                        {on && <Check size={12} strokeWidth={3} />}
                      </span>
                      <Boxes size={15} className="text-forest-500" aria-hidden /> {b.name}
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      {b.description || b.items.map((i) => (seeds.get(i.seed_id) ? seeds.get(i.seed_id)!.name : null)).filter(Boolean).join(", ")}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}

        <p className="mt-6 text-sm font-medium text-forest-900">Which types of seeds would you like to request?</p>
        <p className="mb-3 text-sm text-muted">Search, or open a category and tick the seeds you’d like.</p>
        <SearchInput className="mb-3" value={q} onChange={setQ} placeholder="Search seeds (e.g. tomato, basil)" label="Search seeds" />
        {pickedCount > 0 && (
          <div className="mb-3 rounded-lg border border-forest-200 bg-forest-50/60 p-3" aria-label="Your selected seeds">
            <p className="text-sm font-medium text-forest-900">Your selection ({pickedCount})</p>
            <p className="mb-2 text-[13px] text-muted">Packets are optional. Leave a box blank if you aren’t sure and staff will suggest an amount.</p>
            <ul className="divide-y divide-forest-100">
              {Object.keys(picked)
                .map((id) => seedById.get(id)!)
                .filter(Boolean)
                .sort((a, b) => seedLabel(a).localeCompare(seedLabel(b)))
                .map((s) => (
                  <li key={s.id} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm text-forest-900">{seedLabel(s)}</span>
                    <input
                      className={clsx(inputCls, "!h-9 !w-24 !px-2 text-right text-sm")}
                      inputMode="numeric"
                      placeholder="packets"
                      value={picked[s.id]}
                      onChange={(e) => setPicked((p) => ({ ...p, [s.id]: e.target.value }))}
                      aria-label={`Packets of ${seedLabel(s)} (optional)`}
                    />
                    <button
                      type="button"
                      onClick={() => toggleSeed(s)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-white hover:text-forest-900"
                      aria-label={`Remove ${seedLabel(s)}`}
                    >
                      <X size={16} aria-hidden />
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
        {needle && !byCategory.some(({ category, seeds }) => seeds.some((s) => `${seedLabel(s)} ${category}`.toLowerCase().includes(needle))) && (
          <p className="mb-3 rounded-lg border border-dashed border-sage-300 px-4 py-3 text-sm text-muted">No seeds match “{q.trim()}”. You can describe what you’re looking for in the special requests box below.</p>
        )}
        <div className="space-y-2">
          {byCategory.map(({ category, seeds }) => {
            const shown = seeds.filter((s) => !needle || `${seedLabel(s)} ${category}`.toLowerCase().includes(needle));
            if (shown.length === 0) return null;
            const chosen = seeds.filter((s) => s.id in picked).length;
            const open = needle ? true : (openCats[category] ?? false);
            return (
              <div key={category} className="overflow-hidden rounded-lg border border-sage-200 bg-white">
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-sage-50"
                  aria-expanded={open}
                  onClick={() => setOpenCats((c) => ({ ...c, [category]: !open }))}
                >
                  <span className="font-medium text-forest-900">
                    {category} <span className="text-sm font-normal text-muted">({seeds.length})</span>
                  </span>
                  <span className="flex items-center gap-2 text-sm">
                    {chosen > 0 && <span className="rounded-full bg-forest-600 px-2 py-0.5 text-xs font-medium text-white">{chosen} chosen</span>}
                    <ChevronDown size={16} className={clsx("text-muted transition-transform", open && "rotate-180")} aria-hidden />
                  </span>
                </button>
                {open && (
                  <ul className="grid border-t border-sage-100 sm:grid-cols-2">
                    {shown.map((s) => {
                      const on = s.id in picked;
                      const avail = availableQuantity(s);
                      const out = avail !== null && avail <= 0;
                      return (
                        <li key={s.id} className={clsx("flex items-center gap-2 px-4", on && "bg-forest-50/60")}>
                          <label className={clsx("flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-sm", out && "text-muted")}>
                            <input type="checkbox" className="h-5 w-5 shrink-0 accent-forest-600" checked={on} onChange={() => toggleSeed(s)} />
                            <span className="min-w-0">
                              {seedLabel(s)}
                              {out ? (
                                <span className="text-xs"> (out of stock)</span>
                              ) : avail !== null && avail <= 5 ? (
                                <span className="text-xs text-amber-800"> (only {avail} available)</span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        {tried && errors.qty && <p className="mt-2 text-xs text-red-700">{errors.qty}</p>}
      </Section>

      <Section n={3} title="Details concerning your seed order">
        <div className="grid gap-4">
          <Field label="Any special requests concerning your seed order? Any specific varieties you’re searching for?">
            <textarea className={inputCls} rows={3} value={f.special} onChange={(e) => set("special", e.target.value)} />
          </Field>
          <Field label="How many students/youth will you be growing with?" error={tried ? errors.students : undefined} className="sm:w-72">
            <input className={inputCls} inputMode="numeric" value={f.students} onChange={(e) => set("students", e.target.value)} placeholder="e.g. 25" />
          </Field>
          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-forest-900">
              Are you interested in helping the YFS Youth Seed Library this fall by donating seeds you save from your garden?
            </legend>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {(
                [
                  ["yes", "Yes"],
                  ["help", "Yes, but I need help learning how to save seeds"],
                  ["no", "No"],
                ] as const
              ).map(([v, label]) => (
                <Choice key={v} on={f.donate === v} onClick={() => set("donate", f.donate === v ? "" : v)}>
                  {label}
                </Choice>
              ))}
            </div>
          </fieldset>
          <YesNoField
            label="If given the opportunity, would you like a YFS staff member to offer on-site garden support?"
            value={f.gardenSupport}
            onChange={(v) => set("gardenSupport", v)}
          />
          {f.gardenSupport === "yes" && (
            <Field label="What type of support would you be looking for?">
              <textarea className={inputCls} rows={2} value={f.supportType} onChange={(e) => set("supportType", e.target.value)} />
            </Field>
          )}
        </div>
      </Section>

      {formErrors.length > 0 && (
        <div ref={errorRef} role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-medium">{formErrors.length === 1 ? "Please fix this to continue:" : "Please fix these to continue:"}</p>
          <ul className="mt-1 list-disc pl-5">
            {formErrors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="sticky bottom-0 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-sage-200 bg-sage-50/95 px-4 py-3 backdrop-blur">
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Sprout size={15} className="text-forest-600" aria-hidden />
          {pickedCount} seed type{pickedCount === 1 ? "" : "s"} · {f.wantsBundles === "yes" ? bundles.length : 0} bundle
          {(f.wantsBundles === "yes" ? bundles.length : 0) === 1 ? "" : "s"}
          {tried && errors.nothing && <span className="text-red-800"> — {errors.nothing}</span>}
        </p>
        <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
          {busy && <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {busy ? "Sending…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="mt-4 p-5">
      <h2 className="flex items-center gap-2 font-semibold text-forest-900">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-forest-600 text-xs text-white">{n}</span>
        {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function YesNoField({ label, value, onChange }: { label: string; value: YesNo; onChange: (v: YesNo) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium text-forest-900">{label}</legend>
      <div className="flex gap-2" role="radiogroup">
        {(["yes", "no"] as const).map((v) => (
          <Choice key={v} on={value === v} onClick={() => onChange(value === v ? "" : v)}>
            {v === "yes" ? "Yes" : "No"}
          </Choice>
        ))}
      </div>
    </fieldset>
  );
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={clsx(
        "min-h-11 min-w-20 rounded-md border px-4 py-2 text-sm font-medium",
        on ? "border-forest-600 bg-forest-600 text-white" : "border-sage-200 bg-white text-forest-800 hover:bg-sage-50",
      )}
    >
      {children}
    </button>
  );
}
