/**
 * FICTIONAL sample inventory for demos (YFS asked for sample varieties, quantities, bundles and
 * storage locations). The varieties are YFS's real 2026 catalogue; every count, shelf and bundle
 * size here is made up. Counts are deterministic so the demo looks the same on every machine.
 */
import { createSeed, saveBundle, seedIdentity, setStockCount, updateSeedDetails } from "./domain";
import { SEED_CATALOGUE_2026 } from "./seed-catalogue";
import type { Category, DataSnapshot, SeedInput } from "./types";

/** One cabinet per category, four varieties per drawer, alphabetical. */
const CABINET: Record<Category, string> = {
  Greens: "A",
  Herbs: "B",
  "Root Vegetables": "C",
  Flowers: "D",
  "Fruits / Fruiting Vegetables": "E",
  Legumes: "F",
  Other: "F",
};

/** A few deliberate edge cases so every stock state shows up in the demo. */
const SPECIAL: Record<string, number | null> = {
  "bitter melon|": 0, // out of stock
  "eggplant|ping tung": 4, // low stock
  "parsnip|": 3, // low stock
  "lovage|": null, // not counted yet
};

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function sampleInventory(): SeedInput[] {
  const sorted = [...SEED_CATALOGUE_2026].sort((a, b) =>
    a.category === b.category ? seedIdentity(a).localeCompare(seedIdentity(b)) : a.category.localeCompare(b.category),
  );
  const perCabinet = new Map<string, number>();
  return sorted.map((s) => {
    const cab = CABINET[s.category];
    const n = perCabinet.get(cab) ?? 0;
    perCabinet.set(cab, n + 1);
    const key = seedIdentity(s);
    const qty = key in SPECIAL ? SPECIAL[key] : 10 + (hash(key) % 51); // 10–60 packets
    return {
      ...s,
      physical_quantity: qty,
      unit: "packets",
      storage_location: `Cabinet ${cab} · Drawer ${Math.floor(n / 4) + 1}`,
      low_stock_threshold: 8,
    };
  });
}

/** Bundles as named on the YFS 2026 request form; contents and 1 packet each are demo choices. */
export const SAMPLE_BUNDLES: { name: string; description: string; seeds: [string, string | null][] }[] = [
  {
    name: "Spring Bundle",
    description: "radish, bok choy, spinach, bunching onions",
    seeds: [["Radish", "French Breakfast"], ["Bok Choy", null], ["Spinach", "Butterflay"], ["Onion", "White Gem Hybrid"]],
  },
  {
    name: "Fall Harvest",
    description: "pumpkin, squash, kale, beets, root parsley",
    seeds: [["Pumpkin", "Howden Field"], ["Squash", "Delicata"], ["Kale", "Red Russian"], ["Beet", "Cylindra Formanova"], ["Root Parsley", "Hamburg"]],
  },
  {
    name: "Herbs/Edible Flowers",
    description: "basil, chives, borage, nasturtium, marigold",
    seeds: [["Basil", "Genovese"], ["Chives", null], ["Borage", null], ["Nasturtium (Climbing)", null], ["Marigold", null]],
  },
];

export type SampleLoadResult = { created: number; counted: number; located: number; untouched: number; bundles: number };

/**
 * Add the sample inventory without destroying anything:
 * missing varieties are created; seeds that haven't been counted get the sample count;
 * seeds without a storage location get the sample one. Real counts are never overwritten.
 * Bundles are added only if no bundle with that name exists.
 */
export function loadSampleInventory(db: DataSnapshot, opts: { fillUncounted?: boolean } = {}): SampleLoadResult {
  const fill = opts.fillUncounted ?? true;
  const r: SampleLoadResult = { created: 0, counted: 0, located: 0, untouched: 0, bundles: 0 };
  for (const s of sampleInventory()) {
    const found = db.seeds.find((x) => seedIdentity(x) === seedIdentity(s));
    if (!found) {
      createSeed(db, s);
      r.created++;
      continue;
    }
    let touched = false;
    if (!found.storage_location && s.storage_location) {
      updateSeedDetails(db, found.id, { storage_location: s.storage_location });
      r.located++;
      touched = true;
    }
    if (fill && found.physical_quantity === null && s.physical_quantity != null) {
      setStockCount(db, found.id, s.physical_quantity, "Sample inventory (fictional count)");
      if (found.low_stock_threshold === null) updateSeedDetails(db, found.id, { low_stock_threshold: s.low_stock_threshold });
      r.counted++;
      touched = true;
    }
    if (!touched) r.untouched++;
  }
  for (const b of SAMPLE_BUNDLES) {
    if (db.bundles.some((x) => x.name.toLowerCase() === b.name.toLowerCase())) continue;
    const ids = b.seeds.map(([name, variety]) => db.seeds.find((x) => seedIdentity(x) === seedIdentity({ name, variety }))?.id);
    if (ids.some((id) => !id)) continue;
    saveBundle(db, null, { name: b.name, description: b.description, items: ids.map((seed_id) => ({ seed_id: seed_id!, quantity: 1 })) });
    r.bundles++;
  }
  return r;
}

export function sampleInventoryCsv(): string {
  const cols = ["name", "variety", "category", "physical_quantity", "unit", "storage_location", "low_stock_threshold", "description"] as const;
  const cell = (v: unknown) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [cols.join(","), ...sampleInventory().map((s) => cols.map((c) => cell(s[c])).join(","))].join("\n") + "\n";
}
