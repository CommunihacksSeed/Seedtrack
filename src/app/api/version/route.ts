import { connection } from "next/server";
import { getStore } from "@/lib/store";
import { errorResponse, json } from "@/lib/server/http";

/**
 * Cheap change check that open pages poll. It reads one row, so pages only
 * reload the full snapshot when the data really changed.
 */
export async function GET() {
  await connection();
  try {
    return json({ data: await getStore().version(), build: __SEEDFLOW_BUILD__ });
  } catch (e) {
    return errorResponse(e);
  }
}
