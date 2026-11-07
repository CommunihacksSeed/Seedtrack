import "server-only";
import { createLocalStore } from "./local";
import { createSupabaseStore } from "./supabase";
import type { SeedFlowStore } from "./types";

export function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let cached: SeedFlowStore | null = null;

/** Supabase when configured; otherwise the clearly-labelled local demo store. */
export function getStore(): SeedFlowStore {
  if (!cached) cached = supabaseConfigured() ? createSupabaseStore() : createLocalStore();
  return cached;
}
