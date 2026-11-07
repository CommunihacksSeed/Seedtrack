/**
 * Local demo store: a JSON file on the server, guarded by an in-process lock.
 *
 * It enforces exactly the same business rules as the database (it runs the
 * functions in lib/domain.ts), and writes are serialized within one Node
 * process, so approvals cannot over-reserve in a single dev server. It is NOT
 * production persistence: it is not safe across multiple server instances,
 * and on serverless hosts the file lives in /tmp and can disappear.
 */
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import * as domain from "../domain";
import { buildDemoSnapshot } from "../demo-data";
import type { DataSnapshot } from "../types";
import type { SeedFlowStore } from "./types";

function dataFile() {
  if (process.env.SEEDFLOW_DATA_FILE) return process.env.SEEDFLOW_DATA_FILE;
  if (process.env.VERCEL) return path.join(os.tmpdir(), "seedflow.json");
  return path.join(process.cwd(), ".data", "seedflow.json");
}

let chain: Promise<unknown> = Promise.resolve();
/** Run fn after every previously queued operation finishes. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

async function load(): Promise<DataSnapshot> {
  const file = dataFile();
  try {
    return JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ file, "utf8")) as DataSnapshot;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const fresh = buildDemoSnapshot();
    await save(fresh);
    return fresh;
  }
}

async function save(db: DataSnapshot) {
  const file = dataFile();
  await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(/*turbopackIgnore: true*/ tmp, JSON.stringify(db));
  await fs.rename(/*turbopackIgnore: true*/ tmp, file);
}

/** Apply a domain mutation to a copy; persist only if it succeeds. */
function mutate<T>(fn: (db: DataSnapshot) => T): Promise<T> {
  return withLock(async () => {
    const db = structuredClone(await load());
    const result = fn(db);
    await save(db);
    return structuredClone(result);
  });
}

export function createLocalStore(): SeedFlowStore {
  return {
    mode: "local-demo",
    snapshot: () => withLock(load),
    createSeed: (input) => mutate((db) => domain.createSeed(db, input)),
    updateSeed: (id, input) => mutate((db) => domain.updateSeedDetails(db, id, input)),
    setStockCount: (id, q, notes) => mutate((db) => domain.setStockCount(db, id, q, notes)),
    deleteSeed: (id) => mutate((db) => domain.deleteSeed(db, id)),
    createOrder: (input) => mutate((db) => domain.createOrder(db, input)),
    addOrderItem: (id, name) => mutate((db) => domain.addOrderItem(db, id, name)),
    startReview: (id) => mutate((db) => domain.startReview(db, id)),
    saveReview: (id, r) => mutate((db) => domain.saveReview(db, id, r)),
    approveOrder: (id, r) => mutate((db) => domain.approveOrder(db, id, r)),
    assignSteward: (id, s) => mutate((db) => domain.assignSteward(db, id, s)),
    startPreparing: (id) => mutate((db) => domain.startPreparing(db, id)),
    packItems: (id, p) => mutate((db) => domain.packItems(db, id, p)),
    markReady: (id) => mutate((db) => domain.markReady(db, id)),
    deliverOrder: (id) => mutate((db) => domain.deliverOrder(db, id)),
    cancelOrder: (id, reason) => mutate((db) => domain.cancelOrder(db, id, reason)),
    resetDemo: () => withLock(() => save(buildDemoSnapshot())),
  };
}
