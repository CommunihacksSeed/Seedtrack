import "server-only";
import { ZodError, type ZodType } from "zod";
import { DomainError } from "../domain";
import { isStaff, authMode } from "./auth";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function errorResponse(e: unknown) {
  if (e instanceof DomainError) return json({ error: e.message, code: e.code }, e.status);
  if (e instanceof ZodError) {
    const first = e.issues[0];
    const where = first?.path?.length ? `${first.path.join(".")}: ` : "";
    return json({ error: `${where}${first?.message ?? "Invalid input"}`, code: "invalid" }, 400);
  }
  console.error(e);
  return json({ error: "Something went wrong on the server.", code: "server_error" }, 500);
}

/** Wrap a write handler: staff check, then run, mapping errors to JSON. */
export async function staffWrite(req: Request, fn: () => Promise<unknown>) {
  if (!isStaff(req)) {
    const msg =
      authMode() === "read-only"
        ? "This deployment is read-only: set SEEDFLOW_ADMIN_KEY on the server to enable staff changes."
        : "Staff key required. Enter it on the Settings page.";
    return json({ error: msg, code: "unauthorized" }, 401);
  }
  try {
    return json((await fn()) ?? { ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new DomainError("Request body must be JSON.");
  }
  return schema.parse(body);
}
