import { cognitoAdapter, NotConfiguredError } from "@/lib/integrations/cognito";
import { handleWrite } from "@/lib/server/http";

/** Manual "Sync now". Returns a clear message until the live adapter exists. */
export async function POST() {
  return handleWrite(async () => {
    try {
      const entries = await cognitoAdapter.fetchEntries(null);
      return { ok: true, fetched: entries.length };
    } catch (e) {
      if (e instanceof NotConfiguredError) return { ok: false, message: e.message };
      throw e;
    }
  });
}
