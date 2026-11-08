"use client";

import { useEffect, useState } from "react";
import { Lock, Sprout } from "lucide-react";
import { Button, Field, inputCls } from "@/components/ui";

const ERRORS: Record<string, string> = {
  invalid: "That email and password don’t match a staff account.",
  missing: "Enter your staff email and password.",
  locked: "Too many sign-in attempts. Please wait 15 minutes and try again.",
};

type Status = { signedIn: boolean; setupAllowed: boolean; notConfigured: boolean };

/** Staff sign-in. Only staff accounts can open the panel; schools use /request instead. */
export default function LoginPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nextPath, setNextPath] = useState("/");

  const next = () => {
    const n = new URLSearchParams(window.location.search).get("next");
    // Only same-site paths, so the link can't bounce staff to another website.
    return n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
  };

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    fetch("/api/auth/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: Status) => {
        if (s.signedIn) return window.location.replace(next());
        setNextPath(next());
        if (code) setError(ERRORS[code] ?? ERRORS.invalid);
        setStatus(s);
      })
      .catch(() => setStatus({ signedIn: false, setupAllowed: false, notConfigured: false }));
  }, []);

  const setup = Boolean(status?.setupAllowed);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Read from the form itself so text typed before the page finished loading still counts.
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const email = String(f.get("email") ?? "").trim();
    const name = String(f.get("name") ?? "").trim();
    const password = String(f.get("password") ?? "");
    if (!email || !password) {
      setError("Enter your staff email and password.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(setup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(setup ? { email, name, password } : { email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Sign-in failed. Please try again.");
      window.location.replace(next());
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sage-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-forest-600 text-white">
            <Sprout size={22} aria-hidden />
          </span>
          <span className="font-display text-2xl font-semibold text-forest-900">SeedFlow</span>
        </div>
        {/* method/action make an early click (before scripts load) a safe POST, never a GET with the password in the URL. */}
        <form method="post" action="/api/auth/login" onSubmit={submit} className="rounded-xl border border-sage-200 bg-white p-6 shadow-sm" noValidate>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-forest-900">
            <Lock size={17} aria-hidden /> {setup ? "Create the first staff account" : "Staff sign-in"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {setup
              ? "No staff accounts exist yet on this local server. This account can add colleagues afterwards."
              : "For YFS staff only. Requesting seeds? Use the seed request form instead."}
          </p>
          {status?.notConfigured && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              No staff accounts are set up yet. An administrator needs to add the SEEDFLOW_ADMIN_EMAIL and SEEDFLOW_ADMIN_PASSWORD secrets in Cloudflare.
            </p>
          )}
          <input type="hidden" name="next" value={nextPath} />
          <div className="mt-5 space-y-4">
            <Field label="Staff email">
              <input className={inputCls} name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </Field>
            {setup && (
              <Field label="Your name" hint="Optional">
                <input className={inputCls} name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            )}
            <Field label="Password" hint={setup ? "At least 10 characters" : undefined}>
              <input
                className={inputCls}
                name="password"
                type="password"
                autoComplete={setup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
          </div>
          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="mt-5 w-full" disabled={busy}>
            {busy ? "Signing in…" : setup ? "Create account and sign in" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Schools and community groups:{" "}
          <a href="/request" className="font-medium text-forest-700 underline">
            request seeds here
          </a>
        </p>
      </div>
    </div>
  );
}
