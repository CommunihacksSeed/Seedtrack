/**
 * Inter School Seed Library's Catalogue 2026 (YFS), transcribed from the
 * "Seed Information" Google Doc. The catalogue lists varieties only, with no
 * stock counts, so every entry starts as "Needs Stock Count" (quantity null).
 * Entries like "Carrot - A / B / C" are split into one seed per variety.
 */
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

function parse(block: string, category: (name: string) => Category): SeedInput[] {
  const out: SeedInput[] = [];
  for (const line of block.trim().split("\n")) {
    const [rawName, rawVarieties] = line.split(" - ").map((s) => s.trim());
    // "Tomato (Cherry)" → name "Tomato", note "Cherry tomato"; "Pepper (Hot)" → "Pepper", "Hot pepper".
    const m = rawName.match(/^(Tomato|Pepper) \((.+)\)$/);
    const name = m ? m[1] : rawName;
    const description = m ? `${m[2]} ${m[1].toLowerCase()}` : null;
    const varieties = rawVarieties ? rawVarieties.split(" / ").map((v) => v.trim()) : [null];
    for (const variety of varieties) {
      out.push({ name, variety, category: category(name), description, physical_quantity: null, unit: "packets" });
    }
  }
  return out;
}

export const SEED_CATALOGUE_2026: SeedInput[] = [
  ...parse(VEGETABLES, vegetableCategory),
  ...parse(HERBS, () => "Herbs"),
  ...parse(FLOWERS, () => "Flowers"),
  ...parse(OTHER, () => "Other"),
];
