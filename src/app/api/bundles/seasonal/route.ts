import { getStore } from "@/lib/store";
import { handleWrite } from "@/lib/server/http";
import { addSeasonalBundles } from "@/lib/seasonal-bundles";

/** Add the Spring / Summer / Autumn / Winter bundles that don't exist yet. Signed-in users only (proxy). */
export async function POST() {
  return handleWrite(() => getStore().transact((draft) => addSeasonalBundles(draft)));
}
