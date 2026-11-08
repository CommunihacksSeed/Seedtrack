import { handleSignUp } from "@/lib/server/auth-routes";

export const POST = (req: Request) => handleSignUp(req);
