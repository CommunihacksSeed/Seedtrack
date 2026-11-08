import { handleSignIn } from "@/lib/server/auth-routes";

export const POST = (req: Request) => handleSignIn(req);
