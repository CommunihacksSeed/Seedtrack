import { connection } from "next/server";
import { getStore } from "@/lib/store";
import { errorResponse, json } from "@/lib/server/http";
import { cognitoStatus } from "@/lib/integrations/cognito";
import { emailConfigured } from "@/lib/server/notify";
import { currentStaff } from "@/lib/server/auth-guard";

/** Everything the dashboard needs in one call. */
export async function GET(req: Request) {
  await connection();
  try {
    // proxy.ts already blocks signed-out requests; this re-checks before sending contact details.
    const user = await currentStaff(req);
    if (!user) return json({ error: "Please sign in as staff.", code: "unauthorized" }, 401);
    const store = getStore();
    const snap = await store.snapshot();
    return json({
      mode: store.mode,
      cognito: cognitoStatus(),
      emailConfigured: emailConfigured(),
      user: { email: user.email, name: user.name },
      snapshot: snap,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
