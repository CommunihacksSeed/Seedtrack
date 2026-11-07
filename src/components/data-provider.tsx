"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { DataSnapshot } from "@/lib/types";

export interface AppState {
  mode: "local-demo" | "supabase";
  demo: boolean;
  staff: boolean;
  authMode: "key" | "open-dev" | "read-only";
  cognito: { apiConfigured: boolean; webhookConfigured: boolean; message: string };
  snapshot: DataSnapshot;
}

type Toast = { id: number; kind: "success" | "error"; text: string };

interface Ctx {
  state: AppState | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** POST/PATCH/DELETE JSON with the staff key; refreshes state on success. Throws Error(message) on failure. */
  mutate: <T = unknown>(url: string, body?: unknown, method?: string) => Promise<T>;
  toast: (text: string, kind?: Toast["kind"]) => void;
}

const DataContext = createContext<Ctx | null>(null);
const KEY_STORAGE = "seedflow-staff-key";

export function getStaffKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}
export function setStaffKey(v: string) {
  try {
    if (v) localStorage.setItem(KEY_STORAGE, v);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage unavailable */
  }
}

function headers(): HeadersInit {
  const key = getStaffKey();
  return { "content-type": "application/json", ...(key ? { "x-seedflow-key": key } : {}) };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { headers: headers(), cache: "no-store" });
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
        headers: headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      await refresh();
      return data as T;
    },
    [refresh],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ state, error, loading, refresh, mutate, toast }), [state, error, loading, refresh, mutate, toast]);

  return (
    <DataContext.Provider value={value}>
      {children}
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
