import "server-only";
import { env } from "cloudflare:workers";
import { createD1Store } from "./d1";
import type { SeedFlowStore } from "./types";

/** Bindings are per-environment, so there's nothing worth caching here. */
export function getStore(): SeedFlowStore {
  return createD1Store(env.DB);
}
