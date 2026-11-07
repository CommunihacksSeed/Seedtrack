import { cognitoAdapter, NotConfiguredError } from "@/lib/integrations/cognito";
import { staffWrite } from "@/lib/server/http";

/** Manual "Sync now". Returns a clear message until the live adapter exists. */
export async function POST(req: Request) {
  return staffWrite(req, async () => {
    try {
      const entries = await cognitoAdapter.fetchEntries(null);
      return { ok: true, fetched: entries.length };
    } catch (e) {
      if (e instanceof NotConfiguredError) return { ok: false, message: e.message };
      throw e;
    }
  });
}
