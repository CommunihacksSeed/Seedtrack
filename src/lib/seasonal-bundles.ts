/**
 * Seasonal bundles for the seed request form: Spring, Summer, Autumn and Winter,
 * four seeds each, one packet per seed. Which seeds go in each bundle, and any
 * stock count filled in here, are FICTIONAL demo choices, not YFS data.
 */
import { createSeed, saveBundle, seedIdentity, setStockCount } from "./domain";
import { SEED_CATALOGUE_2026 } from "./seed-catalogue";
import type { Category, DataSnapshot } from "./types";

type BundleSeed = { name: string; variety: string | null; category: Category };

export const SEASONAL_BUNDLES: { name: string; description: string; seeds: BundleSeed[] }[] = [
  {
    name: "Spring Bundle",
    description: "Quick cool-weather crops: radish, spinach, lettuce, bok choy",
    seeds: [
      { name: "Radish", variety: "French Breakfast", category: "Root Vegetables" },
      { name: "Spinach", variety: "Butterflay", category: "Greens" },
      { name: "Lettuce", variety: "Black Seeded Simpson", category: "Greens" },
      { name: "Bok Choy", variety: null, category: "Greens" },
    ],
  },
  {
    name: "Summer Bundle",
    description: "Warm-season favourites: tomato, cucumber, basil, zucchini",
    seeds: [
      { name: "Tomato", variety: "Crimson Giant", category: "Fruits / Fruiting Vegetables" },
      { name: "Cucumber", variety: "Marketmore", category: "Fruits / Fruiting Vegetables" },
      { name: "Basil", variety: "Genovese", category: "Herbs" },
      { name: "Zucchini", variety: "Mutabile", category: "Fruits / Fruiting Vegetables" },
    ],
  },
  {
    name: "Autumn Bundle",
    description: "Harvest crops: pumpkin, squash, kale, beets",
    seeds: [
      { name: "Pumpkin", variety: "Howden Field", category: "Fruits / Fruiting Vegetables" },
      { name: "Squash", variety: "Delicata", category: "Fruits / Fruiting Vegetables" },
      { name: "Kale", variety: "Red Russian", category: "Greens" },
      { name: "Beet", variety: "Cylindra Formanova", category: "Root Vegetables" },
    ],
  },
  {
    name: "Winter Bundle",
    description: "Indoor and overwintering: onion, carrot, chives, parsley",
    seeds: [
      { name: "Onion", variety: "White Gem Hybrid", category: "Root Vegetables" },
      { name: "Carrot", variety: "Nantes Coreless", category: "Root Vegetables" },
      { name: "Chives", variety: null, category: "Herbs" },
      { name: "Parsley", variety: "Forest Green", category: "Herbs" },
    ],
  },
];

/** Fictional count given to a bundle seed that is missing or has never been counted. */
export const FICTIONAL_COUNT = 40;

export type SeasonalResult = { bundles: string[]; seedsCreated: number; seedsCounted: number };

/**
 * Add any seasonal bundle that doesn't exist yet (matched by name; existing bundles are left alone).
 * Seeds the bundle needs are created if missing, and seeds that were never counted get a
 * fictional count so bundle requests can be approved. Real stock counts are never changed.
 */
export function addSeasonalBundles(db: DataSnapshot, opts: { fillUncounted?: boolean; at?: string } = {}): SeasonalResult {
  const { fillUncounted = true, at } = opts;
  const r: SeasonalResult = { bundles: [], seedsCreated: 0, seedsCounted: 0 };
  for (const b of SEASONAL_BUNDLES) {
    if (db.bundles.some((x) => x.name.trim().toLowerCase() === b.name.toLowerCase())) continue;
    const ids = b.seeds.map((s) => {
      let seed = db.seeds.find((x) => seedIdentity(x) === seedIdentity(s));
      if (!seed) {
        const cat = SEED_CATALOGUE_2026.find((c) => seedIdentity(c) === seedIdentity(s));
        seed = createSeed(db, { ...(cat ?? s), physical_quantity: FICTIONAL_COUNT, unit: "packets", low_stock_threshold: 8 }, at);
        r.seedsCreated++;
      } else if (fillUncounted && seed.physical_quantity === null) {
        setStockCount(db, seed.id, FICTIONAL_COUNT, "Fictional demo count for seasonal bundles", at);
        r.seedsCounted++;
      }
      return seed.id;
    });
    saveBundle(db, null, { name: b.name, description: b.description, items: ids.map((seed_id) => ({ seed_id, quantity: 1 })) }, at);
    r.bundles.push(b.name);
  }
  return r;
}
