import { getStore } from "@/lib/store";
import { parseBody, handleWrite } from "@/lib/server/http";
import { bundleSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  return handleWrite(async () => getStore().saveBundle(null, await parseBody(req, bundleSchema)));
}
