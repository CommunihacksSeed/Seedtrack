import { handleMe } from "@/lib/server/auth-routes";

export const GET = (req: Request) => handleMe(req);
