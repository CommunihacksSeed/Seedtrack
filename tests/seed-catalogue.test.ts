import { describe, expect, it } from "vitest";
import { parseCatalogueExport, SEED_CATALOGUE_2026 } from "../src/lib/seed-catalogue";

const exportText = (list: string) =>
  `\uFEFFSeed catalogue\r\nQuick Search List of Seeds\r\n${list}\r\n________\r\nFLOWERS\r\nDetails that must stay out`;

describe("YFS catalogue export", () => {
  it("reads only the quick list and shares category and variety rules with the built-in catalogue", () => {
    const { rows, unrecognized } = parseCatalogueExport(exportText(
      "VEGETABLES\r\nBeet – Betterave / Cylindra Formanova\r\nTomato (Cherry) - Blue Berries\r\nFLOWERS\r\nCalendula\r\nOTHER\r\nGarlic Bulbils",
    ));
    expect(rows).toEqual([
      { ...SEED_CATALOGUE_2026.find((s) => s.variety === "Cylindra Formanova"), variety: "Betterave" },
      SEED_CATALOGUE_2026.find((s) => s.variety === "Cylindra Formanova"),
      SEED_CATALOGUE_2026.find((s) => s.variety === "Blue Berries"),
      { name: "Calendula", variety: null, category: "Flowers", description: null, physical_quantity: null, unit: "packets" },
      SEED_CATALOGUE_2026.find((s) => s.name === "Garlic Bulbils"),
    ]);
    expect(unrecognized).toEqual([]);
  });

  it("reports unsupported lines and collapses repeated catalogue identities", () => {
    const { rows, unrecognized } = parseCatalogueExport(exportText(
      "HERBS\nBasil - Genovese / genovese\nBasil - Genovese\nBasil -\nMYSTERY CROPS\nSurprise seed\nVEGETABLES\nUnknown Vegetable",
    ));
    expect(rows.map((s) => s.variety)).toEqual(["Genovese"]);
    expect(unrecognized).toEqual(["Basil -", "MYSTERY CROPS", "Surprise seed", "Unknown Vegetable"]);
  });

  it("refuses an export without a bounded quick list", () => {
    expect(() => parseCatalogueExport("Quick Search List of Seeds\nHERBS\nBasil\nDescription\nMint")).toThrow(/quick search list/i);
  });
});
