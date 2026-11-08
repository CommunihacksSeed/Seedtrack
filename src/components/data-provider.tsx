"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { DataSnapshot } from "@/lib/types";
import { isPublicPath } from "./public-path";

export interface AppState {
  mode: "d1";
  cognito: { apiConfigured: boolean; webhookConfigured: boolean; message: string };
  emailConfigured: boolean;
  user: { email: string; name: string | null };
  snapshot: DataSnapshot;
}

type Toast = { id: number; kind: "success" | "error"; text: string };

interface Ctx {
  state: AppState | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** POST/PATCH/DELETE JSON; refreshes state on success. Throws Error(message) on failure. */
  mutate: <T = unknown>(url: string, body?: unknown, method?: string) => Promise<T>;
  toast: (text: string, kind?: Toast["kind"]) => void;
}

const DataContext = createContext<Ctx | null>(null);
const POLL_MS = 10_000;
const HEADERS: HeadersInit = { "content-type": "application/json" };

/** Session expired or missing: go to sign-in and come back here afterwards. */
function toLogin() {
  const next = window.location.pathname + window.location.search;
  window.location.replace(`/login${next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`);
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [updateReady, setUpdateReady] = useState(false);
  const seen = useRef<{ data?: number; build?: string }>({});
  // The public request form must never load staff data (requests, contacts).
  const isPublic = isPublicPath(usePathname());

  const toast = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.status === 401) return toLogin();
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load data");
      setState(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load data");
    } finally {
      setLoading(false);
    }
  }, []);

  const mutate = useCallback(
    async <T,>(url: string, body?: unknown, method = "POST"): Promise<T> => {
      const res = await fetch(url, {
        method,
        headers: HEADERS,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 401) {
        toLogin();
        throw new Error("Your session ended. Please sign in again.");
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      await refresh();
      return data as T;
    },
    [refresh],
  );

  useEffect(() => {
    if (isPublic) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    refresh();
  }, [refresh, isPublic]);

  // Keep open pages current: another person's change reloads the data, and a new
  // deployment offers a reload rather than forcing one over a half-filled form.
  useEffect(() => {
    if (isPublic) return;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as { data: number; build: string };
        const { data, build } = seen.current;
        seen.current = next;
        if (data !== undefined && data !== next.data) await refresh();
        if (build !== undefined && build !== next.build) setUpdateReady(true);
      } catch {
        /* offline; the next check will catch up */
      }
    };
    check();
    const timer = setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [refresh, isPublic]);

  const value = useMemo(() => ({ state, error, loading, refresh, mutate, toast }), [state, error, loading, refresh, mutate, toast]);

  return (
    <DataContext.Provider value={value}>
      {children}
      {updateReady && (
        <div role="status" className="no-print fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-forest-200 bg-white px-4 py-3 text-sm shadow-lg">
          <span>A new version of SeedFlow is available.</span>
          <button type="button" className="font-medium text-forest-700 underline" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      )}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg ${
              t.kind === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-forest-200 bg-white text-forest-900"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData outside DataProvider");
  return ctx;
}
