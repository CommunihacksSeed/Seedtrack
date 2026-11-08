"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, Sprout } from "lucide-react";
import { Button, Field, inputCls } from "@/components/ui";

/** Only same-site paths, so a link can't send someone to another website after signing in. */
function nextPath() {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}

const RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "At least one letter", test: (p: string) => /[A-Za-z]/.test(p) },
  { label: "At least one number", test: (p: string) => /[0-9]/.test(p) },
];

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const signup = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordOk = RULES.every((r) => r.test(password));
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (signup && !passwordOk) {
      setError("Your password doesn’t meet the rules below yet.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      window.location.href = nextPath();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-md bg-forest-600 text-white">
            <Sprout size={20} strokeWidth={2.2} aria-hidden />
          </span>
          <span className="font-display text-2xl font-semibold text-forest-900">SeedFlow</span>
        </div>
        <div className="rounded-lg border border-sage-200 bg-white p-6">
          <h1 className="font-display text-2xl font-semibold text-forest-900">{signup ? "Create an account" : "Sign in"}</h1>
          <p className="mt-1 text-sm text-muted">{signup ? "Use your email and a password." : "Welcome back. Sign in with your email and password."}</p>

          <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
            <Field label="Email">
              <input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </Field>
            <Field label="Password">
              <input
                className={inputCls}
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={signup ? "password-rules" : undefined}
              />
            </Field>
            {signup && (
              <ul id="password-rules" className="space-y-1 text-sm" aria-label="Password rules">
                {RULES.map((r) => {
                  const ok = r.test(password);
                  return (
                    <li key={r.label} className={ok ? "flex items-center gap-2 text-forest-700" : "flex items-center gap-2 text-muted"}>
                      {ok ? <Check size={14} aria-hidden /> : <Circle size={14} aria-hidden />}
                      {r.label}
                      <span className="sr-only">{ok ? "(met)" : "(not met yet)"}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? (signup ? "Creating account…" : "Signing in…") : signup ? "Create account" : "Sign in"}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-muted">
          {signup ? "Already have an account? " : "New here? "}
          <Link
            href={signup ? "/login" : "/signup"}
            className="font-medium text-forest-700 underline"
            onClick={(e) => {
              // Keep ?next= when switching between sign in and sign up.
              e.preventDefault();
              router.push((signup ? "/login" : "/signup") + window.location.search);
            }}
          >
            {signup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </div>
    </div>
  );
}
