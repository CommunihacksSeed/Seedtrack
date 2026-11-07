import { z } from "zod";
import { getStore } from "@/lib/store";
import { DomainError, matchSeed } from "@/lib/domain";
import { parseBody, handleWrite } from "@/lib/server/http";
import { rowToSeedInput } from "@/lib/import-mapping";

const bodySchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).max(2000),
  /** "create" skips rows that already exist; "update" also updates their stock counts. */
  existing: z.enum(["skip", "update"]).default("update"),
});

/** Import inventory rows. Each row is processed independently and reported. */
export async function POST(req: Request) {
  return handleWrite(async () => {
    const { rows, existing } = await parseBody(req, bodySchema);
    const store = getStore();
    const results: { row: number; status: "created" | "updated" | "skipped" | "error"; message: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const { input, errors } = rowToSeedInput(rows[i]);
      if (!input) {
        results.push({ row: i + 1, status: "error", message: errors.join("; ") });
        continue;
      }
      const label = input.variety ? `${input.name} — ${input.variety}` : input.name;
      try {
        const snap = await store.snapshot();
        const found = snap.seeds.find(
          (s) =>
            s.name.toLowerCase() === input.name.toLowerCase() &&
            (s.variety ?? "").toLowerCase() === (input.variety ?? "").toLowerCase(),
        ) ?? (input.variety ? null : matchSeed(input.name, snap.seeds.filter((s) => !s.variety)));
        if (!found) {
          await store.createSeed(input);
          results.push({ row: i + 1, status: "created", message: label });
        } else if (existing === "skip") {
          results.push({ row: i + 1, status: "skipped", message: `${label} already exists` });
        } else {
          const { physical_quantity, ...details } = input;
          await store.updateSeed(found.id, details);
          if (physical_quantity !== null && physical_quantity !== undefined && physical_quantity !== found.physical_quantity)
            await store.setStockCount(found.id, physical_quantity, "CSV import");
          results.push({ row: i + 1, status: "updated", message: label });
        }
      } catch (e) {
        results.push({ row: i + 1, status: "error", message: e instanceof DomainError ? e.message : "Server error" });
      }
    }
    return { results };
  });
}
