import { getStore } from "@/lib/store";
import { staffWrite } from "@/lib/server/http";

/** Replace all data with the fictional demo dataset. */
export async function POST(req: Request) {
  return staffWrite(req, async () => {
    if (process.env.SEEDFLOW_DISABLE_DEMO_RESET === "true") throw new Error("Demo reset disabled");
    await getStore().resetDemo();
    return { ok: true };
  });
}
