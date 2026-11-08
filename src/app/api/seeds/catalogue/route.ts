import { connection } from "next/server";
import { parseCatalogueExport } from "@/lib/seed-catalogue";
import { json } from "@/lib/server/http";

const SOURCE = "https://docs.google.com/document/d/1gbT3OAz6rUTbw20iDhLot62XFJGs2BoInj1IYiQVe1o/export?format=txt";

export async function GET() {
  await connection();
  const timeout = AbortSignal.timeout(8000);
  let document: string;
  try {
    const response = await fetch(SOURCE, { signal: timeout, cache: "no-store" });
    if (!response.ok) {
      return json({ error: `Google Docs returned HTTP ${response.status} for the text export.` }, 502);
    }
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/plain")) {
      return json({ error: "Google Docs returned a page instead of plain text. Check that the link allows public viewing and downloading." }, 502);
    }
    document = await response.text();
  } catch {
    return json({ error: timeout.aborted ? "Google Docs took too long to return the text export." : "The server could not fetch the Google Docs text export." }, 502);
  }

  if (document.length > 250_000) {
    return json({ error: "The catalogue export is too large to preview." }, 422);
  }
  try {
    return json(parseCatalogueExport(document));
  } catch (error) {
    return json({ error: (error as Error).message }, 422);
  }
}
