import { getStore } from "@/lib/store";
import { parseBody, staffWrite } from "@/lib/server/http";
import { settingsPatchSchema } from "@/lib/schemas";

export async function PATCH(req: Request) {
  return staffWrite(req, async () => getStore().updateSettings(await parseBody(req, settingsPatchSchema)));
}
