/**
 * Delivery route planning for drop-off orders.
 *
 * Distances are straight-line (haversine) distances multiplied by a road
 * factor, so totals are estimates. Stop order is found with nearest-neighbour
 * construction improved by 2-opt, which is near-optimal for the handful of
 * stops a YFS delivery run has. Large runs are split into trips of at most
 * `maxStops` stops: each trip takes a consecutive stretch of the optimized
 * tour, and then each trip is re-optimized on its own.
 */
export interface Point {
  lat: number;
  lng: number;
}
export interface Stop<T = unknown> extends Point {
  id: string;
  data: T;
}
export interface Leg {
  from: string;
  to: string;
  km: number;
}
export interface Trip<T = unknown> {
  stops: Stop<T>[];
  legs: Leg[];
  km: number;
  minutes: number;
}
export interface PlanOptions {
  maxStops: number;
  returnToDepot: boolean;
  avgSpeedKmh: number;
  minutesPerStop: number;
  roadFactor?: number;
}

export const ROAD_FACTOR = 1.3;

export function haversineKm(a: Point, b: Point) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Length of depot → stops (→ depot). */
function tourKm(depot: Point, order: Point[], back: boolean, f: number) {
  let km = 0;
  let prev = depot;
  for (const p of order) {
    km += haversineKm(prev, p) * f;
    prev = p;
  }
  if (back && order.length) km += haversineKm(prev, depot) * f;
  return km;
}

/** Nearest-neighbour + 2-opt ordering of stops starting at the depot. */
export function optimizeOrder<T extends Point>(depot: Point, stops: T[], returnToDepot: boolean, roadFactor = ROAD_FACTOR): T[] {
  if (stops.length <= 1) return [...stops];
  const left = [...stops];
  const route: T[] = [];
  let cur: Point = depot;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (haversineKm(cur, left[i]) < haversineKm(cur, left[best])) best = i;
    cur = left[best];
    route.push(left.splice(best, 1)[0]);
  }
  // 2-opt: reverse segments while it shortens the tour.
  let improved = true;
  let bestKm = tourKm(depot, route, returnToDepot, roadFactor);
  for (let guard = 0; improved && guard < 200; guard++) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)];
        const km = tourKm(depot, candidate, returnToDepot, roadFactor);
        if (km < bestKm - 1e-9) {
          route.splice(0, route.length, ...candidate);
          bestKm = km;
          improved = true;
        }
      }
    }
  }
  return route;
}

export function planRoutes<T>(depot: Point & { id?: string }, stops: Stop<T>[], opts: PlanOptions): Trip<T>[] {
  const f = opts.roadFactor ?? ROAD_FACTOR;
  if (!stops.length) return [];
  const tour = optimizeOrder(depot, stops, opts.returnToDepot, f);
  const chunks: Stop<T>[][] = [];
  for (let i = 0; i < tour.length; i += Math.max(1, opts.maxStops)) chunks.push(tour.slice(i, i + Math.max(1, opts.maxStops)));
  return chunks.map((chunk) => {
    const ordered = optimizeOrder(depot, chunk, opts.returnToDepot, f);
    const legs: Leg[] = [];
    let prev: Point & { id: string } = { ...depot, id: "depot" };
    for (const s of ordered) {
      legs.push({ from: prev.id, to: s.id, km: haversineKm(prev, s) * f });
      prev = s;
    }
    if (opts.returnToDepot) legs.push({ from: prev.id, to: "depot", km: haversineKm(prev, depot) * f });
    const km = legs.reduce((a, l) => a + l.km, 0);
    const minutes = (km / opts.avgSpeedKmh) * 60 + ordered.length * opts.minutesPerStop;
    return { stops: ordered, legs, km, minutes };
  });
}

/** Google Maps directions link (Maps URLs API: no key needed). */
export function googleMapsLink(depot: Point, stops: Point[], returnToDepot: boolean) {
  const fmt = (p: Point) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  if (!stops.length) return null;
  const destination = returnToDepot ? depot : stops[stops.length - 1];
  const waypoints = returnToDepot ? stops : stops.slice(0, -1);
  const params = new URLSearchParams({ api: "1", origin: fmt(depot), destination: fmt(destination), travelmode: "driving" });
  if (waypoints.length) params.set("waypoints", waypoints.map(fmt).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
