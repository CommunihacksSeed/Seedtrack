"use client";

/**
 * Address lookup with OpenStreetMap Nominatim, called from the staff member's
 * browser (only staff can see addresses). Nominatim's usage policy allows at
 * most one request per second, so lookups are queued and spaced out.
 */
let last = 0;

export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const wait = Math.max(0, last + 1100 - Date.now());
  last = Date.now() + wait;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ca");
  url.searchParams.set("q", address);
  const res = await fetch(url, { headers: { "accept-language": "en" } });
  if (!res.ok) throw new Error(`Address lookup failed (${res.status})`);
  const data = (await res.json()) as { lat: string; lon: string }[];
  if (!data.length) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
}

/** Parse "45.42, -75.69" (e.g. copied from Google Maps). */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
