import { handleSignOut } from "@/lib/server/auth-routes";

export const POST = (req: Request) => handleSignOut(req);
