/**
 * Seed season details shown on the public request form.
 *
 * These are the dates YFS published for the 2026 spring season. They have
 * passed and have NOT been confirmed for any later season. Do not guess new
 * dates: update this file only with dates YFS has confirmed, then set
 * `applicationsOpen` to true.
 */
export const SEASON = {
  label: "2026 spring season",
  recommendedDeadline: "February 25, 2026",
  finalDeadline: "March 15, 2026",
  distributionStart: "February 12, 2026",
  /** True only when YFS has confirmed a currently active application window. */
  applicationsOpen: false,
  contactEmail: "jessica@seeds.ca",
} as const;
