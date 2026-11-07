import { DomainError } from "@/lib/domain";
import { getStore } from "@/lib/store";
import { handleWrite } from "@/lib/server/http";

/** Replace all data with the fictional demo dataset. */
export async function POST() {
  return handleWrite(async () => {
    if (process.env.SEEDFLOW_DISABLE_DEMO_RESET === "true") throw new DomainError("Demo reset is disabled on this deployment.", 403, "forbidden");
    await getStore().resetDemo();
    return { ok: true };
  });
}
