"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Sprout } from "lucide-react";
import { Button, ErrorState, Loading } from "@/components/ui";
import { SeedRequestForm, type FormBundle, type FormSeed } from "@/components/seed-request-form";

/**
 * Public seed request form: the link schools and community groups use to ask
 * for seeds. No login and no staff screens; submissions land in Seed Requests
 * as "Received" for staff to review.
 */
export default function PublicRequestPage() {
  const [catalogue, setCatalogue] = useState<{ seeds: FormSeed[]; bundles: FormBundle[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: number | null } | null>(null);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/public/catalogue", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load the form");
      setCatalogue(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the form");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [load]);

  const header = (
    <header className="mb-2 flex items-center gap-3 pt-2">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-forest-600 text-white">
        <Sprout size={22} aria-hidden />
      </span>
      <div>
        <h1 className="font-display text-2xl font-semibold leading-tight text-forest-900 sm:text-3xl">YFS Seed Request Form</h1>
        <p className="text-sm text-muted">Inter-School Seed Library · Youth in Food Systems</p>
      </div>
    </header>
  );

  return (
    <div className="min-h-screen bg-sage-50 px-4 py-6 sm:py-10">
      {done ? (
        <div className="mx-auto max-w-xl">
          {header}
          <div className="mt-6 rounded-xl border border-forest-200 bg-white p-6 text-center shadow-sm">
            <CheckCircle2 size={40} className="mx-auto text-forest-600" aria-hidden />
            <h2 className="mt-3 text-xl font-semibold text-forest-900">Thank you! Your request was received.</h2>
            {done.number && (
              <p className="mt-1 text-muted">
                Your request number is <strong className="text-forest-900">#{done.number}</strong>.
              </p>
            )}
            <p className="mt-3 text-sm text-muted">
              Our Youth Seed Stewards will review it and get your seeds ready. Questions? Email{" "}
              <a className="text-forest-700 underline" href="mailto:jessica@seeds.ca">
                jessica@seeds.ca
              </a>
              .
            </p>
            <Button
              className="mt-5"
              onClick={() => {
                setDone(null);
                setFormKey((k) => k + 1);
                window.scrollTo({ top: 0 });
              }}
            >
              Submit another request
            </Button>
          </div>
        </div>
      ) : error ? (
        <div className="mx-auto max-w-xl">
          {header}
          <ErrorState title="Couldn’t load the form" message={error} onRetry={load} />
        </div>
      ) : !catalogue ? (
        <Loading label="Loading form" />
      ) : (
        <SeedRequestForm
          key={formKey}
          seeds={catalogue.seeds}
          bundleOptions={catalogue.bundles}
          header={header}
          onSubmit={async (payload) => {
            const res = await fetch("/api/public/requests", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
            setDone({ number: data.order_number ?? null });
            window.scrollTo({ top: 0 });
          }}
        />
      )}
      <p className="mx-auto mt-8 max-w-3xl text-center text-xs text-muted">Seeds are free for schools and community groups. A program of Seeds of Diversity Canada.</p>
    </div>
  );
}
