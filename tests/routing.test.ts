import { describe, expect, it } from "vitest";
import { googleMapsLink, haversineKm, optimizeOrder, planRoutes } from "../src/lib/routing";

const depot = { lat: 45.0, lng: -75.0 };
// Points on a line east of the depot, given out of order.
const line = [3, 1, 4, 2].map((n) => ({ id: `p${n}`, lat: 45.0, lng: -75.0 + n * 0.1, data: n }));

describe("routing", () => {
  it("computes haversine distances", () => {
    // Ottawa → Toronto is roughly 350 km in a straight line.
    expect(haversineKm({ lat: 45.4215, lng: -75.6972 }, { lat: 43.6532, lng: -79.3832 })).toBeGreaterThan(340);
    expect(haversineKm({ lat: 45.4215, lng: -75.6972 }, { lat: 43.6532, lng: -79.3832 })).toBeLessThan(360);
  });

  it("orders stops along the shortest path", () => {
    expect(optimizeOrder(depot, line, false).map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("2-opt removes crossings that nearest-neighbour leaves", () => {
    // A square visited from a corner: the optimal round trip goes around the perimeter.
    const sq = [
      { id: "a", lat: 45.0, lng: -74.9 },
      { id: "b", lat: 45.1, lng: -74.9 },
      { id: "c", lat: 45.1, lng: -75.0 },
      { id: "d", lat: 45.05, lng: -74.95 },
    ];
    const order = optimizeOrder(depot, sq, true).map((p) => p.id);
    const tour = [depot, ...order.map((id) => sq.find((s) => s.id === id)!), depot];
    let km = 0;
    for (let i = 1; i < tour.length; i++) km += haversineKm(tour[i - 1], tour[i]);
    // Brute force the best possible tour for comparison.
    const perms = (xs: string[]): string[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x) => perms(xs.filter((y) => y !== x)).map((p) => [x, ...p])));
    const best = Math.min(
      ...perms(sq.map((s) => s.id)).map((p) => {
        const t = [depot, ...p.map((id) => sq.find((s) => s.id === id)!), depot];
        let k = 0;
        for (let i = 1; i < t.length; i++) k += haversineKm(t[i - 1], t[i]);
        return k;
      }),
    );
    expect(km).toBeCloseTo(best, 6);
  });

  it("splits into trips and estimates time", () => {
    const trips = planRoutes(depot, line, { maxStops: 2, returnToDepot: true, avgSpeedKmh: 40, minutesPerStop: 10 });
    expect(trips).toHaveLength(2);
    expect(trips.flatMap((t) => t.stops)).toHaveLength(4);
    for (const t of trips) {
      expect(t.legs).toHaveLength(t.stops.length + 1);
      expect(t.minutes).toBeCloseTo((t.km / 40) * 60 + t.stops.length * 10, 6);
    }
    expect(trips[0].stops.map((s) => s.id)).toEqual(["p1", "p2"]);
  });

  it("builds a Google Maps link", () => {
    const url = googleMapsLink(depot, line.slice(0, 2), true)!;
    expect(url).toContain("https://www.google.com/maps/dir/?api=1");
    expect(decodeURIComponent(url)).toContain("waypoints=45.000000,-74.700000|45.000000,-74.900000");
    expect(googleMapsLink(depot, [], true)).toBeNull();
  });
});
