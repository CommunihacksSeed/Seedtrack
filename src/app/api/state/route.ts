import { connection } from "next/server";
import { getStore } from "@/lib/store";
import { authMode, isStaff } from "@/lib/server/auth";
import { errorResponse, json } from "@/lib/server/http";
import { cognitoStatus } from "@/lib/integrations/cognito";

/** Everything the dashboard needs in one call. Contact details only for staff. */
export async function GET(req: Request) {
  await connection();
  try {
    const store = getStore();
    const snap = await store.snapshot();
    const staff = isStaff(req);
    if (!staff) {
      snap.orders = snap.orders.map((o) => ({ ...o, requester_email: null, mailing_address: null }));
    }
    return json({
      mode: store.mode,
      staff,
      authMode: authMode(),
      cognito: cognitoStatus(),
      snapshot: snap,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
