import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { createSeed, emptySnapshot, seedIdentity, stockStatus } from "../src/lib/domain";
import { buildDemoSnapshot } from "../src/lib/demo-data";
import { SEED_CATALOGUE_2026 } from "../src/lib/seed-catalogue";
import { loadSampleInventory, sampleInventory, sampleInventoryCsv } from "../src/lib/sample-inventory";

describe("sample inventory (fictional)", () => {
  it("covers every 2026 catalogue variety with a count and a drawer, plus every stock state", () => {
    const s = sampleInventory();
    expect(s).toHaveLength(SEED_CATALOGUE_2026.length);
    expect(new Set(s.map(seedIdentity)).size).toBe(s.length);
    expect(s.every((x) => /^Cabinet [A-F] · Drawer \d+$/.test(x.storage_location ?? ""))).toBe(true);
    const db = emptySnapshot();
    loadSampleInventory(db);
    const states = new Set(db.seeds.map(stockStatus));
    expect(states).toEqual(new Set(["Available", "Low Stock", "Out of Stock", "Needs Stock Count"]));
    expect(db.bundles.map((b) => b.name).sort()).toEqual(["Fall Harvest", "Herbs/Edible Flowers", "Spring Bundle"]);
  });

  it("never overwrites real counts or existing bundles, and is safe to run twice", () => {
    const db = emptySnapshot();
    const kale = createSeed(db, { name: "Kale", variety: "Red Russian", category: "Greens", physical_quantity: 7, storage_location: "Back room" });
    const first = loadSampleInventory(db);
    expect(db.seeds.find((x) => x.id === kale.id)).toMatchObject({ physical_quantity: 7, storage_location: "Back room" });
    expect(first.created).toBe(SEED_CATALOGUE_2026.length - 1);
    const again = loadSampleInventory(db);
    expect(again).toMatchObject({ created: 0, counted: 0, located: 0, bundles: 0 });
    expect(db.bundles).toHaveLength(3);
  });

  it("fills uncounted seeds only when asked", () => {
    const db = emptySnapshot();
    createSeed(db, { name: "Arugula", category: "Greens", physical_quantity: null });
    loadSampleInventory(db, { fillUncounted: false });
    expect(db.seeds.find((x) => x.name === "Arugula")!.physical_quantity).toBeNull();
    loadSampleInventory(db);
    expect(db.seeds.find((x) => x.name === "Arugula")!.physical_quantity).not.toBeNull();
  });

  it("the downloadable CSV matches the code", () => {
    expect(readFileSync("public/templates/yfs-sample-inventory-fictional.csv", "utf8")).toBe(sampleInventoryCsv());
  });

  it("the demo dataset includes the whole catalogue and keeps Basil uncounted", () => {
    const db = buildDemoSnapshot();
    for (const c of SEED_CATALOGUE_2026) expect(db.seeds.some((x) => seedIdentity(x) === seedIdentity(c))).toBe(true);
    expect(db.seeds.find((x) => x.name === "Basil")!.physical_quantity).toBeNull();
    expect(db.seeds.every((x) => x.storage_location)).toBe(true);
  });
});
