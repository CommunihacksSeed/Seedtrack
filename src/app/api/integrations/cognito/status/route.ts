import { connection } from "next/server";
import { cognitoStatus } from "@/lib/integrations/cognito";
import { json } from "@/lib/server/http";

export async function GET() {
  await connection();
  return json(cognitoStatus());
}
