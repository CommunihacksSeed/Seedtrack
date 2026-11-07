import { describe, expect, it } from "vitest";
import { INVENTORY_VIEW_TEST, REQUEST_VIEW_STATUSES } from "../src/lib/views";
import { ORDER_STATUSES, type Seed } from "../src/lib/types";

const seed = (physical: number | null, reserved = 0, threshold: number | null = null): Seed => ({
  id: "s",
  name: "Kale",
  variety: null,
  category: "Greens",
  description: null,
  physical_quantity: physical,
  reserved_quantity: reserved,
  unit: "packets",
  storage_location: null,
  low_stock_threshold: threshold,
  created_at: "",
  updated_at: "",
});

describe("request views", () => {
  it("put every status in exactly one of To review / In progress / Completed", () => {
    const grouped = [...REQUEST_VIEW_STATUSES.open, ...REQUEST_VIEW_STATUSES.progress, ...REQUEST_VIEW_STATUSES.done];
    expect(grouped.sort()).toEqual([...ORDER_STATUSES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(REQUEST_VIEW_STATUSES.all).toEqual([...ORDER_STATUSES]);
  });
});

describe("inventory views", () => {
  const { uncounted, low, allocatable } = INVENTORY_VIEW_TEST;
  it("treat unknown stock as needing a count, never as zero", () => {
    expect(uncounted(seed(null))).toBe(true);
    expect(low(seed(null, 0, 5))).toBe(false);
    expect(allocatable(seed(null))).toBe(false);
  });
  it("treat a counted zero as counted and out of stock", () => {
    expect(uncounted(seed(0))).toBe(false);
    expect(low(seed(0))).toBe(true);
    expect(allocatable(seed(0))).toBe(false);
  });
  it("use available = on hand − reserved", () => {
    expect(allocatable(seed(10, 10))).toBe(false);
    expect(low(seed(10, 10))).toBe(true);
    expect(allocatable(seed(10, 4))).toBe(true);
    expect(low(seed(10, 4, 6))).toBe(true);
    expect(low(seed(10, 4, 5))).toBe(false);
  });
});
