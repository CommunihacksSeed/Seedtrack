import { getStore } from "@/lib/store";
import { parseBody, staffWrite } from "@/lib/server/http";
import { seedInputSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  return staffWrite(req, async () => getStore().createSeed(await parseBody(req, seedInputSchema)));
}
