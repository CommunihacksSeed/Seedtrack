import type { AppSettings } from "./types";

/**
 * Suggested packets for a requested seed when the requester gave no quantity.
 * Only a suggestion: staff confirm every approved quantity during review.
 */
export function suggestQuantity(rule: AppSettings["allocation"], studentCount: number | null): number | null {
  if (rule.mode === "none") return null;
  const raw = rule.mode === "fixed" ? rule.fixed : Math.ceil((studentCount ?? 0) / Math.max(1, rule.students_per_packet));
  return Math.min(rule.max, Math.max(rule.min, raw));
}

export function describeRule(rule: AppSettings["allocation"]) {
  if (rule.mode === "none") return "No suggestion: staff enter every quantity.";
  if (rule.mode === "fixed") return `${rule.fixed} packets per variety (between ${rule.min} and ${rule.max}).`;
  return `1 packet per ${rule.students_per_packet} students, at least ${rule.min} and at most ${rule.max} per variety.`;
}
