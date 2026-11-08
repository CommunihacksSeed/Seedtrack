/**
 * Inter School Seed Library's Catalogue 2026 (YFS), transcribed from the
 * "Seed Information" Google Doc. The catalogue lists varieties only, with no
 * stock counts, so every entry starts as "Needs Stock Count" (quantity null).
 * Entries like "Carrot - A / B / C" are split into one seed per variety.
 */
import { seedIdentity } from "./domain";
import type { Category, SeedInput } from "./types";

const VEGETABLES = `
Arugula
Bean - Pencil Pod Black Wax
Bean - Purple Pole
Bean - Royal Burgundy
Beet - Cylindra Formanova
Bitter Melon
Bok Choy
Broccoli - De Cicco
Cabbage - Red Express
Cantaloupe - Delicious 51
Carrot - Chantenay Red / Nantes Coreless / Tendersweet
Collards
Cucumber - Marketmore / Straight 8
Eggplant - Ping Tung
Kale - Red Russian
Kohlrabi - Purple Vienna
Lettuce - Black Seeded Simpson / Iceberg / Mystery
Melon - Oka
Onion - White Gem Hybrid
Parsnip
Pepper (Sweet) - Purple Beauty
Pepper (Hot) - Buena Mulata
Pumpkin - Howden Field
Radish - French Breakfast / Cherry Belle / Garden Giant
Red Orach
Root Parsley - Hamburg
Rutabaga - Laurentian
Snow Pea - Dwarf Grey Sugar
Spinach - Butterflay
Squash - Delicata
Squash - Red Kuri
Tomato (Cherry) - Blue Berries
Tomato (Cherry) - Patio Choice
Tomato (Cherry) - Washington Cherry
Tomato (Large) - Crimson Giant
Turnip - Purple Top White Globe
Watermelon - Blacktail Mountain
Zucchini - Mutabile`;

const HERBS = `
Basil - Genovese
Borage
Chives
Cilantro
Common Rue
Dill
Lemon Balm
Lovage
Mint
Oregano
Parsley - Forest Green
Rosemary
Thyme`;

const FLOWERS = `
Bee Balm
Black Eyed Susan
Blanket Flower
Blazing Star
Blue Vervain
Garden Catchfly
Marigold
Milkweed
Nasturtium (Climbing)
Purple Coneflower
Spotted Joe Pye Weed
Sunflower - Teddy Bear / Large Grey Striped
Wild Bergamot
Wildflower Mix`;

const OTHER = `
Garlic Bulbils`;

const GREENS = ["Arugula", "Bok Choy", "Broccoli", "Cabbage", "Collards", "Kale", "Kohlrabi", "Lettuce", "Red Orach", "Spinach"];
const ROOTS = ["Beet", "Carrot", "Onion", "Parsnip", "Radish", "Root Parsley", "Rutabaga", "Turnip"];
const LEGUMES = ["Bean", "Snow Pea"];

function vegetableCategory(name: string): Category {
  if (GREENS.includes(name)) return "Greens";
  if (ROOTS.includes(name)) return "Root Vegetables";
  if (LEGUMES.includes(name)) return "Legumes";
  return "Fruits / Fruiting Vegetables";
}

const seedName = /^\p{L}[\p{L}\p{M}\p{N} .’'()&-]{0,199}$/u;
const varietyName = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .’'()&-]{0,199}$/u;

function parseLine(line: string, categorize: (name: string) => Category | undefined): SeedInput[] {
  const [rawName, rawVarieties, ...extra] = line.split(/\s+[-–—](?:\s+|$)/u);
  const varieties = rawVarieties === undefined ? [null] : rawVarieties.split("/").map((v) => v.trim());
  if (extra.length || !seedName.test(rawName) || varieties.some((v) => v !== null && !varietyName.test(v))) return [];

  // Keep qualifiers in the description so the name matches existing inventory.
  const qualifier = /^(Tomato|Pepper) \((.+)\)$/i.exec(rawName);
  const name = qualifier ? (qualifier[1].toLowerCase() === "tomato" ? "Tomato" : "Pepper") : rawName;
  const description = qualifier ? `${qualifier[2]} ${name.toLowerCase()}` : null;
  const category = categorize(name);
  if (!category) return [];
  return varieties.map((variety) => ({ name, variety, category, description, physical_quantity: null, unit: "packets" }));
}

function parseBlock(block: string, categorize: (name: string) => Category) {
  return block.trim().split("\n").flatMap((line) => parseLine(line, categorize));
}

const vegetableSeeds = parseBlock(VEGETABLES, vegetableCategory);
const vegetableCategories = new Map(vegetableSeeds.map((seed) => [seed.name.toLowerCase(), seed.category]));

export const SEED_CATALOGUE_2026: SeedInput[] = [
  ...vegetableSeeds,
  ...parseBlock(HERBS, () => "Herbs"),
  ...parseBlock(FLOWERS, () => "Flowers"),
  ...parseBlock(OTHER, () => "Other"),
];

export type CatalogueExport = { rows: SeedInput[]; unrecognized: string[] };

const sectionCategories: Record<string, (name: string) => Category | undefined> = {
  VEGETABLES: (name) => vegetableCategories.get(name.toLowerCase()),
  HERBS: () => "Herbs",
  FLOWERS: () => "Flowers",
  OTHER: () => "Other",
};

/** The detailed entries below the divider may lag behind the quick list. */
export function parseCatalogueExport(text: string): CatalogueExport {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const heading = lines.findIndex((line) => /^quick search list of seeds$/i.test(line));
  const end = lines.findIndex((line, i) => i > heading && /^_{5,}$/.test(line));
  if (heading < 0 || end < 0 || end - heading > 2000) {
    throw new Error("Could not find a bounded Quick Search List of Seeds in the document.");
  }

  const rows = new Map<string, SeedInput>();
  const unrecognized: string[] = [];
  let categorize: ((name: string) => Category | undefined) | undefined;
  for (const line of lines.slice(heading + 1, end)) {
    if (!line) continue;
    const section = line.toUpperCase();
    if (Object.hasOwn(sectionCategories, section)) {
      categorize = sectionCategories[section];
      continue;
    }
    if (/^[A-Z][A-Z &/]+$/.test(line)) categorize = undefined;
    const seeds = categorize ? parseLine(line, categorize) : [];
    if (!seeds.length) unrecognized.push(line);
    for (const seed of seeds) {
      const key = seedIdentity(seed);
      if (!rows.has(key)) rows.set(key, seed);
    }
  }
  if (rows.size > 2000) throw new Error("The catalogue contains more than 2,000 seed entries.");
  return { rows: [...rows.values()], unrecognized };
}
