import { connection } from "next/server";
import { getStore, supabaseConfigured } from "@/lib/store";
import { errorResponse, json } from "@/lib/server/http";
import { cognitoStatus } from "@/lib/integrations/cognito";
import { emailConfigured } from "@/lib/server/notify";

/** Everything the dashboard needs in one call. */
export async function GET() {
  await connection();
  try {
    const store = getStore();
    const snap = await store.snapshot();
    return json({
      mode: store.mode,
      demo: !supabaseConfigured(),
      cognito: cognitoStatus(),
      emailConfigured: emailConfigured(),
      snapshot: snap,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
