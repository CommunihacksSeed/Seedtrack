"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Keep one piece of view state (a tab, a selected record) in the URL so links
 * from the dashboard can open a page in the right view, and Back works.
 */
export function useQueryState(key: string, fallback = ""): [string, (value: string | null) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const value = params.get(key) ?? fallback;
  const set = useCallback(
    (next: string | null) => {
      const p = new URLSearchParams(window.location.search);
      if (next === null || next === "" || next === fallback) p.delete(key);
      else p.set(key, next);
      const qs = p.toString();
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    },
    [key, fallback, path, router],
  );
  return [value, set];
}
