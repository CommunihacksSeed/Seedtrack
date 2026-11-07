import { getStore } from "@/lib/store";
import { parseBody, staffWrite } from "@/lib/server/http";
import { orderInputSchema } from "@/lib/schemas";

/** Manual request entry. */
export async function POST(req: Request) {
  return staffWrite(req, async () => {
    const input = await parseBody(req, orderInputSchema);
    return getStore().createOrder({ ...input, source: input.source ?? "manual" });
  });
}
