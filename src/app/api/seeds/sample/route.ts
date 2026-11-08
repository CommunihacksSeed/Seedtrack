import { getStore } from "@/lib/store";
import { handleWrite } from "@/lib/server/http";
import { loadSampleInventory } from "@/lib/sample-inventory";

/**
 * Load the FICTIONAL sample inventory (all 2026 catalogue varieties with counts, drawers and bundles).
 * Non-destructive: real stock counts are never overwritten, so it's allowed even on the live site.
 */
export async function POST() {
  return handleWrite(() => getStore().transact((draft) => loadSampleInventory(draft)));
}
