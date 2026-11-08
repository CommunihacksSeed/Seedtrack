import { connection } from "next/server";
import { json } from "@/lib/server/http";
import { adminSecrets, authDb, currentStaff } from "@/lib/server/auth-guard";
import { countUsers, isLocalRequest } from "@/lib/server/staff-auth";

/** For the sign-in page: is anyone signed in, and does a first account still need creating? */
export async function GET(req: Request) {
  await connection();
  const user = await currentStaff(req);
  const noAccounts = (await countUsers(authDb())) === 0;
  const { email, password } = adminSecrets();
  return json({
    signedIn: Boolean(user),
    user: user ? { email: user.email, name: user.name } : null,
    // Only a local dev server with no accounts and no admin secrets offers the setup form.
    setupAllowed: noAccounts && !(email && password) && isLocalRequest(req),
    notConfigured: noAccounts && !(email && password) && !isLocalRequest(req),
  });
}
