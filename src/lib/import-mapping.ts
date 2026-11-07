/**
 * Field mapping for request and inventory imports (CSV / JSON / webhook).
 * Cognito Forms export column names are NOT assumed to equal our fields:
 * staff confirm the mapping in the UI, and these guesses only pre-fill it.
 * The guesses come from the labels on the 2026 YFS Seed Request Form.
 */
import { CATEGORIES, type Category, type OrderInput, type SeedInput } from "./types";

export type RequestField =
  | "external_entry_id"
  | "requester_name"
  | "requester_email"
  | "organization_name"
  | "school_use"
  | "mailing_address"
  | "requested_bundles"
  | "requested_seeds"
  | "special_requests"
  | "student_count"
  | "garden_support"
  | "seed_donation_interest"
  | "submitted_at";

export const REQUEST_FIELDS: { key: RequestField; label: string; required?: boolean; guesses: string[] }[] = [
  { key: "external_entry_id", label: "Cognito Entry ID", guesses: ["entry id", "entry number", "id", "entry", "number"] },
  { key: "requester_name", label: "Requester name", required: true, guesses: ["your name", "name", "requester", "contact name", "full name"] },
  { key: "requester_email", label: "Email", guesses: ["email", "e-mail", "email address"] },
  { key: "organization_name", label: "School / organization", required: true, guesses: ["what school are these seeds for", "school", "organization", "organisation", "school name", "school or organization"] },
  { key: "school_use", label: "For school use? (yes/no)", guesses: ["are these seeds for school use", "school use", "is this for school", "for a school", "school use?"] },
  { key: "mailing_address", label: "Mailing address", guesses: ["mailing address", "address", "shipping address"] },
  { key: "requested_bundles", label: "Bundles (list)", guesses: ["bundles", "bundle", "seed bundles"] },
  { key: "requested_seeds", label: "Seed types (list)", guesses: ["which types of seeds would you like to request", "seed types", "seeds", "seed varieties", "varieties", "requested seeds"] },
  { key: "special_requests", label: "Special requests", guesses: ["are there any special requests you have concerning your seed order", "special requests", "notes", "comments", "special instructions"] },
  { key: "student_count", label: "Number of students", guesses: ["how many students/youth will you be growing with", "number of students", "students", "student count", "number of youth", "participants"] },
  { key: "garden_support", label: "Wants garden support? (yes/no)", guesses: ["would you like to have a yfs staff member offer on-site garden support", "garden support", "gardening support", "support"] },
  { key: "seed_donation_interest", label: "Interested in donating seeds? (yes/no)", guesses: ["are you interested in helping the yfs youth seed library", "seed donation", "donate seeds", "donation"] },
  { key: "submitted_at", label: "Submitted date", guesses: ["date submitted", "submitted", "timestamp", "entry date", "date created", "date"] },
];

export type Mapping = Partial<Record<RequestField, string>>;

const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<string>();
  for (const f of REQUEST_FIELDS) {
    const hit =
      headers.find((h) => !used.has(h) && f.guesses.some((g) => n(h) === n(g))) ??
      headers.find((h) => !used.has(h) && f.guesses.some((g) => n(g).length > 3 && n(h).includes(n(g))));
    if (hit) {
      mapping[f.key] = hit;
      used.add(hit);
    }
  }
  return mapping;
}

export function splitList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (v === null || v === undefined) return [];
  return String(v)
    .split(/[;\n|]|,(?![^()]*\))/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "Kale x5", "Kale (5)", "5 x Kale", "Kale: 5" → quantity; "Kale" → null (unspecified). */
export function parseSeedEntry(raw: string): { name: string; quantity: number | null } {
  const s = raw.trim();
  let m = s.match(/^(.*?)\s*(?:x|×|:|-)\s*(\d+)\s*(?:packets?|packs?|pkts?)?$/i);
  if (m && m[1]) return { name: m[1].trim(), quantity: Number(m[2]) };
  m = s.match(/^(.*?)\s*\((\d+)\s*(?:packets?|packs?|pkts?)?\)$/i);
  if (m && m[1]) return { name: m[1].trim(), quantity: Number(m[2]) };
  m = s.match(/^(\d+)\s*(?:x|×)?\s*(?:packets?|packs?)?\s*(?:of\s+)?(.+)$/i);
  if (m && m[2]) return { name: m[2].trim(), quantity: Number(m[1]) };
  return { name: s, quantity: null };
}

export function parseBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (["yes", "y", "true", "1", "oui"].includes(s) || /^yes\b/.test(s)) return true;
  if (["no", "n", "false", "0", "non"].includes(s)) return false;
  return null;
}

function parseIntOrNull(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const num = Number(String(v).trim());
  return Number.isInteger(num) && num >= 0 ? num : "invalid";
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

/** Turn one source row into an OrderInput, collecting validation errors. */
export function rowToOrderInput(
  row: Record<string, unknown>,
  mapping: Mapping,
  source: string,
): { input: OrderInput | null; errors: string[] } {
  const get = (f: RequestField) => (mapping[f] ? row[mapping[f]!] : undefined);
  const errors: string[] = [];
  const requester_name = str(get("requester_name"));
  const organization_name = str(get("organization_name"));
  if (!requester_name) errors.push("Missing requester name");
  if (!organization_name) errors.push("Missing school / organization");
  const email = str(get("requester_email"));
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`Invalid email "${email}"`);
  const students = parseIntOrNull(get("student_count"));
  if (students === "invalid") errors.push("Number of students must be a whole number");
  let submitted_at: string | null = null;
  const rawDate = str(get("submitted_at"));
  if (rawDate) {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) errors.push(`Unrecognized date "${rawDate}"`);
    else submitted_at = d.toISOString();
  }
  const items = splitList(get("requested_seeds")).map((s) => {
    const p = parseSeedEntry(s);
    return { requested_seed_name: p.name, requested_quantity: p.quantity };
  });
  const bundles = splitList(get("requested_bundles"));
  if (items.length === 0 && bundles.length === 0) errors.push("No seeds or bundles requested");
  if (errors.length) return { input: null, errors };
  const ext = get("external_entry_id");
  return {
    input: {
      external_entry_id: ext === undefined || ext === null || String(ext).trim() === "" ? null : String(ext).trim(),
      requester_name: requester_name!,
      requester_email: email,
      organization_name: organization_name!,
      school_use: parseBool(get("school_use")),
      mailing_address: str(get("mailing_address")),
      student_count: students as number | null,
      requested_bundles: bundles,
      special_requests: str(get("special_requests")),
      garden_support: parseBool(get("garden_support")),
      seed_donation_interest: parseBool(get("seed_donation_interest")),
      submitted_at,
      source,
      items,
    },
    errors: [],
  };
}

// ---------- Inventory CSV ----------

export const INVENTORY_COLUMNS = [
  "name",
  "variety",
  "category",
  "physical_quantity",
  "unit",
  "storage_location",
  "low_stock_threshold",
  "description",
] as const;

export function rowToSeedInput(row: Record<string, unknown>): { input: SeedInput | null; errors: string[] } {
  const errors: string[] = [];
  const name = str(row.name);
  if (!name) errors.push("Missing name");
  const rawCat = str(row.category);
  const category =
    (CATEGORIES.find((c) => rawCat && n(c) === n(rawCat)) ??
      CATEGORIES.find((c) => rawCat && n(c).startsWith(n(rawCat)))) ?? (rawCat ? null : "Other");
  if (!category) errors.push(`Unknown category "${rawCat}" (use one of: ${CATEGORIES.join(", ")})`);
  const physical = parseIntOrNull(row.physical_quantity);
  if (physical === "invalid") errors.push("physical_quantity must be a whole number or blank (blank = not counted)");
  const threshold = parseIntOrNull(row.low_stock_threshold);
  if (threshold === "invalid") errors.push("low_stock_threshold must be a whole number or blank");
  if (errors.length) return { input: null, errors };
  return {
    input: {
      name: name!,
      variety: str(row.variety),
      category: category as Category,
      physical_quantity: physical as number | null,
      unit: str(row.unit) ?? "packets",
      storage_location: str(row.storage_location),
      low_stock_threshold: threshold as number | null,
      description: str(row.description),
    },
    errors: [],
  };
}
