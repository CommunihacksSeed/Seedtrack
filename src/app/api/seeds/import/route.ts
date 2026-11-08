import { z } from "zod";
import { getStore } from "@/lib/store";
import { createSeed, DomainError, matchSeed, seedIdentity, setStockCount, updateSeedDetails } from "@/lib/domain";
import { parseBody, handleWrite } from "@/lib/server/http";
import { rowToSeedInput } from "@/lib/import-mapping";

type ImportResult = { row: number; status: "created" | "updated" | "skipped" | "error"; message: string };

const bodySchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).max(2000),
  /** "create" skips rows that already exist; "update" also updates their stock counts. */
  existing: z.enum(["skip", "update"]).default("update"),
});

/** Import inventory rows. Each row is processed independently and reported. */
export async function POST(req: Request) {
  return handleWrite(async () => {
    const { rows, existing } = await parseBody(req, bodySchema);
    const results = await getStore().transact((draft) => {
      const report: ImportResult[] = [];
      for (let i = 0; i < rows.length; i++) {
        const { input, errors } = rowToSeedInput(rows[i]);
        if (!input) {
          report.push({ row: i + 1, status: "error", message: errors.join("; ") });
          continue;
        }
        const label = input.variety ? `${input.name} — ${input.variety}` : input.name;
        try {
          const found = draft.seeds.find(
            (s) =>
              s.name.toLowerCase() === input.name.toLowerCase() &&
              (s.variety ?? "").toLowerCase() === (input.variety ?? "").toLowerCase(),
          ) ?? (input.variety ? null : matchSeed(input.name, draft.seeds.filter((s) => !s.variety)))
            ?? (existing === "skip" ? draft.seeds.find((seed) => seedIdentity(seed) === seedIdentity(input)) : null);
          if (!found) {
            createSeed(draft, input);
            report.push({ row: i + 1, status: "created", message: label });
          } else if (existing === "skip") {
            report.push({ row: i + 1, status: "skipped", message: `${label} already exists` });
          } else {
            const { physical_quantity, ...details } = input;
            updateSeedDetails(draft, found.id, details);
            if (physical_quantity !== null && physical_quantity !== undefined && physical_quantity !== found.physical_quantity)
              setStockCount(draft, found.id, physical_quantity, "CSV import");
            report.push({ row: i + 1, status: "updated", message: label });
          }
        } catch (e) {
          report.push({ row: i + 1, status: "error", message: e instanceof DomainError ? e.message : "Server error" });
        }
      }
      return report;
    });
    return { results };
  });
}
