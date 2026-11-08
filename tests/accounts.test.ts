import type { D1Database } from "@cloudflare/workers-types";
import { readFileSync } from "fs";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AuthError,
  createSession,
  deleteSession,
  passwordProblem,
  readSessionCookie,
  sessionAccount,
  sessionCookie,
  signIn,
  signUp,
} from "../src/lib/server/accounts";

let mf: Miniflare;
let db: D1Database;
const statements = readFileSync("migrations/0004_accounts.sql", "utf8")
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
  await db.batch([db.prepare("DROP TABLE IF EXISTS account_sessions"), db.prepare("DROP TABLE IF EXISTS accounts")]);
  await db.batch(statements.map((s) => db.prepare(s)));
});

describe("password rules", () => {
  it("need 8+ characters with a letter and a number", () => {
    expect(passwordProblem("abc12")).toMatch(/at least 8/);
    expect(passwordProblem("abcdefgh")).toMatch(/letter and one number/);
    expect(passwordProblem("12345678")).toMatch(/letter and one number/);
    expect(passwordProblem("abcd1234")).toBeNull();
    expect(passwordProblem("Seeds 2026!")).toBeNull();
  });
});

describe("accounts", () => {
  it("sign up, then sign in with the same email and password", async () => {
    const a = await signUp(db, "  Grace@Example.org ", "seedflow26");
    expect(a.email).toBe("grace@example.org");
    expect((await signIn(db, "GRACE@example.org", "seedflow26"))?.id).toBe(a.id);
  });

  it("store only a salted hash, never the password", async () => {
    await signUp(db, "a@example.org", "seedflow26");
    await signUp(db, "b@example.org", "seedflow26");
    const rows = (await db.prepare("SELECT password_hash FROM accounts").all<{ password_hash: string }>()).results;
    expect(rows.every((r) => r.password_hash.startsWith("pbkdf2$100000$") && !r.password_hash.includes("seedflow26"))).toBe(true);
    expect(rows[0].password_hash).not.toBe(rows[1].password_hash);
  });

  it("reject weak passwords, bad emails and duplicate emails", async () => {
    await expect(signUp(db, "a@example.org", "password")).rejects.toBeInstanceOf(AuthError);
    await expect(signUp(db, "not-an-email", "seedflow26")).rejects.toThrow(/valid email/);
    await signUp(db, "a@example.org", "seedflow26");
    await expect(signUp(db, "A@EXAMPLE.ORG", "other1234")).rejects.toMatchObject({ status: 409 });
  });

  it("refuse a wrong password or an unknown email", async () => {
    await signUp(db, "a@example.org", "seedflow26");
    expect(await signIn(db, "a@example.org", "seedflow27")).toBeNull();
    expect(await signIn(db, "nobody@example.org", "seedflow26")).toBeNull();
  });

  it("sessions work until signed out, and the cookie is HttpOnly and Secure", async () => {
    const a = await signUp(db, "a@example.org", "seedflow26");
    const { token, expires } = await createSession(db, a.id);
    const cookie = sessionCookie(token, expires);
    expect(cookie).toMatch(/^__Host-seedflow_session=.+; Path=\/; HttpOnly; Secure; SameSite=Lax/);
    const req = new Request("https://seedflow.space/", { headers: { cookie: `other=1; ${cookie.split(";")[0]}` } });
    expect(readSessionCookie(req)).toBe(token);
    expect((await sessionAccount(db, token))?.email).toBe("a@example.org");
    expect(await sessionAccount(db, "made-up-token")).toBeNull();
    await deleteSession(db, token);
    expect(await sessionAccount(db, token)).toBeNull();
  });
});
