import type { D1Database } from "@cloudflare/workers-types";
import { readFileSync } from "fs";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AuthError,
  addUser,
  authenticate,
  changePassword,
  countUsers,
  createSession,
  deleteSession,
  ensureBootstrapAdmin,
  hashPassword,
  readCookie,
  removeUser,
  sessionCookie,
  sessionUser,
  verifyPassword,
} from "../src/lib/server/staff-auth";

// Staff accounts against real D1 semantics (workerd + SQLite) through Miniflare.
let mf: Miniflare;
let db: D1Database;
const statements = readFileSync("migrations/0003_staff_auth.sql", "utf8")
  .replace(/^--.*$/gm, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok') } }", d1Databases: ["DB"] });
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
});
afterAll(() => mf.dispose());
beforeEach(async () => {
  await db.batch(["staff_sessions", "staff_users"].map((t) => db.prepare(`DROP TABLE IF EXISTS ${t}`)));
  await db.batch(statements.map((s) => db.prepare(s)));
});

describe("passwords", () => {
  it("are hashed with a salt and verify only the right password", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toContain("correct horse");
    expect(a).not.toBe(b); // different salt each time
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("correct horse batterY", a)).toBe(false);
    expect(await verifyPassword("anything", "garbage")).toBe(false);
  });
});

describe("staff accounts", () => {
  it("signs in only with the right email + password (email case-insensitive)", async () => {
    await addUser(db, "Rayna@YFS.example", "Rayna", "seedlibrary2026");
    expect((await authenticate(db, "rayna@yfs.example", "seedlibrary2026"))?.email).toBe("rayna@yfs.example");
    expect(await authenticate(db, "rayna@yfs.example", "wrong-password")).toBeNull();
    expect(await authenticate(db, "someone@else.example", "seedlibrary2026")).toBeNull();
  });

  it("stores no plain-text passwords", async () => {
    await addUser(db, "a@yfs.example", null, "a-long-secret-1");
    const row = await db.prepare("SELECT password_hash FROM staff_users").first<{ password_hash: string }>();
    expect(row!.password_hash.startsWith("pbkdf2$")).toBe(true);
    expect(row!.password_hash).not.toContain("a-long-secret-1");
  });

  it("rejects short passwords, bad emails and duplicates", async () => {
    await expect(addUser(db, "a@yfs.example", null, "short")).rejects.toThrow(AuthError);
    await expect(addUser(db, "not-an-email", null, "long-enough-pass")).rejects.toThrow(/valid email/);
    await addUser(db, "a@yfs.example", null, "long-enough-pass");
    await expect(addUser(db, "A@yfs.example", null, "long-enough-pass")).rejects.toThrow(/already exists/);
  });

  it("creates the first admin from secrets once, and never again", async () => {
    await ensureBootstrapAdmin(db, "admin@yfs.example", "admin-pass-123");
    await ensureBootstrapAdmin(db, "other@yfs.example", "other-pass-123");
    expect(await countUsers(db)).toBe(1);
    expect(await authenticate(db, "other@yfs.example", "other-pass-123")).toBeNull();
    await ensureBootstrapAdmin(db, undefined, undefined);
    expect(await countUsers(db)).toBe(1);
  });

  it("won't remove yourself or the last account", async () => {
    const a = await addUser(db, "a@yfs.example", null, "long-enough-pass");
    await expect(removeUser(db, a.id, a.id)).rejects.toThrow(/your own account/);
    const b = await addUser(db, "b@yfs.example", null, "long-enough-pass");
    await removeUser(db, b.id, a.id);
    expect(await countUsers(db)).toBe(1);
  });
});

describe("sessions", () => {
  it("are stored hashed, expire, and end on sign-out", async () => {
    const u = await addUser(db, "a@yfs.example", null, "long-enough-pass");
    const { token, expires } = await createSession(db, u.id);
    expect((await sessionUser(db, token))?.email).toBe("a@yfs.example");
    const stored = await db.prepare("SELECT token_hash FROM staff_sessions").first<{ token_hash: string }>();
    expect(stored!.token_hash).not.toBe(token);
    expect(await sessionUser(db, token + "x")).toBeNull();
    expect(await sessionUser(db, null)).toBeNull();
    expect(expires.getTime() - Date.now()).toBeLessThanOrEqual(12 * 3600_000);
    await db.prepare("UPDATE staff_sessions SET expires_at = ?").bind(new Date(Date.now() - 1000).toISOString()).run();
    expect(await sessionUser(db, token)).toBeNull();
    const again = await createSession(db, u.id);
    await deleteSession(db, again.token);
    expect(await sessionUser(db, again.token)).toBeNull();
  });

  it("removing an account or changing a password signs out other sessions", async () => {
    const a = await addUser(db, "a@yfs.example", null, "long-enough-pass");
    const b = await addUser(db, "b@yfs.example", null, "long-enough-pass");
    const bs = await createSession(db, b.id);
    await removeUser(db, b.id, a.id);
    expect(await sessionUser(db, bs.token)).toBeNull();

    const s1 = await createSession(db, a.id);
    const s2 = await createSession(db, a.id);
    const me = (await sessionUser(db, s1.token))!;
    await expect(changePassword(db, a.id, "wrong-current", "new-password-123", me.tokenHash)).rejects.toThrow(/current password/);
    await changePassword(db, a.id, "long-enough-pass", "new-password-123", me.tokenHash);
    expect(await sessionUser(db, s1.token)).not.toBeNull();
    expect(await sessionUser(db, s2.token)).toBeNull();
    expect(await authenticate(db, "a@yfs.example", "new-password-123")).not.toBeNull();
  });

  it("cookie is HttpOnly, Secure and SameSite", () => {
    const c = sessionCookie("tok", new Date(Date.now() + 1000));
    expect(c).toMatch(/^__Host-seedflow_session=tok;/);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=Lax");
    expect(readCookie(new Request("https://x/", { headers: { cookie: `a=1; ${c.split(";")[0]}` } }))).toBe("tok");
  });
});
