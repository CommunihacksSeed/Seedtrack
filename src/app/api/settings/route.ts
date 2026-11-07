import { getStore } from "@/lib/store";
import { parseBody, handleWrite } from "@/lib/server/http";
import { settingsPatchSchema } from "@/lib/schemas";

export async function PATCH(req: Request) {
  return handleWrite(async () => getStore().updateSettings(await parseBody(req, settingsPatchSchema)));
}
