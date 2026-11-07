import { getStore } from "@/lib/store";
import { parseBody, handleWrite } from "@/lib/server/http";
import { seedInputSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  return handleWrite(async () => getStore().createSeed(await parseBody(req, seedInputSchema)));
}
