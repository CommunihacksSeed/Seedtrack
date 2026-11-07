import { getStore } from "@/lib/store";
import { parseBody, staffWrite } from "@/lib/server/http";
import { bundleSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  return staffWrite(req, async () => getStore().saveBundle(null, await parseBody(req, bundleSchema)));
}
