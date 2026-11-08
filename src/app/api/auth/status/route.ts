import { connection } from "next/server";
import { json } from "@/lib/server/http";
import { adminSecrets, authDb, currentStaff, setupCodeHash } from "@/lib/server/auth-guard";
import { countUsers, isLocalRequest } from "@/lib/server/staff-auth";

/** For the sign-in page: is anyone signed in, and does a first account still need creating? */
export async function GET(req: Request) {
  await connection();
  const user = await currentStaff(req);
  const noAccounts = (await countUsers(authDb())) === 0;
  const { email, password } = adminSecrets();
  const secrets = Boolean(email && password);
  const local = isLocalRequest(req) && !secrets;
  const withCode = !local && !secrets && Boolean(setupCodeHash());
  return json({
    signedIn: Boolean(user),
    user: user ? { email: user.email, name: user.name } : null,
    // With no accounts yet: a local dev server offers setup freely; the live site asks for the setup code.
    setupAllowed: noAccounts && (local || withCode),
    setupNeedsCode: noAccounts && withCode,
    notConfigured: noAccounts && !local && !secrets && !withCode,
  });
}
