"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { Car, CheckCircle2, ExternalLink, Mail, MapPin, MapPinned, Navigation, Package, Printer, Settings2, Store, Truck } from "lucide-react";
import { useData } from "@/components/data-provider";
import { Badge, Button, buttonCls, Card, CardHeader, EmptyState, Field, Loading, Modal, PageHeader, StatusBadge, Switch, inputCls } from "@/components/ui";
import { geocode, parseLatLng } from "@/lib/geocode";
import { googleMapsLink, planRoutes, type Stop } from "@/lib/routing";
import { DELIVERY_LABELS, DELIVERY_METHODS, type AppSettings, type DeliveryMethod, type Order } from "@/lib/types";

const METHOD_ICON: Record<DeliveryMethod, React.ReactNode> = {
  "drop-off": <Car size={14} />,
  mail: <Mail size={14} />,
  pickup: <Store size={14} />,
};

export default function DeliveriesPage() {
  const { state, mutate, toast } = useData();
  const [includePacking, setIncludePacking] = useState(true);
  const [locating, setLocating] = useState<string | null>(null);
  const [manual, setManual] = useState<Order | null>(null);
  const [editDepot, setEditDepot] = useState(false);
  const [busy, setBusy] = useState(false);

  const view = useMemo(() => {
    if (!state) return null;
    const db = state.snapshot;
    const d = db.settings.delivery;
    const statuses = includePacking ? ["Approved", "Preparing", "Ready"] : ["Ready"];
    const orders = db.orders.filter((o) => statuses.includes(o.status)).sort((a, b) => a.order_number - b.order_number);
    const packets = (o: Order) =>
      db.order_items.filter((i) => i.order_id === o.id).reduce((a, i) => a + (i.approved_quantity ?? 0), 0);
    const dropOffs = orders.filter((o) => o.delivery_method === "drop-off");
    const routable = dropOffs.filter((o) => o.delivery_lat !== null && o.delivery_lng !== null);
    const depot = d.depot_lat !== null && d.depot_lng !== null ? { lat: d.depot_lat, lng: d.depot_lng } : null;
    const trips = depot
      ? planRoutes<Order>(
          depot,
          routable.map((o): Stop<Order> => ({ id: o.id, lat: o.delivery_lat!, lng: o.delivery_lng!, data: o })),
          { maxStops: d.max_stops_per_trip, returnToDepot: d.return_to_depot, avgSpeedKmh: d.avg_speed_kmh, minutesPerStop: d.minutes_per_stop },
        )
      : [];
    return {
      d,
      depot,
      orders,
      packets,
      trips,
      unlocated: dropOffs.filter((o) => o.delivery_lat === null),
      undecided: orders.filter((o) => !o.delivery_method),
      mail: orders.filter((o) => o.delivery_method === "mail"),
      pickup: orders.filter((o) => o.delivery_method === "pickup"),
    };
  }, [state, includePacking]);

  if (!state || !view) return <Loading />;

  async function act(o: Order, body: object, msg?: string) {
    try {
      await mutate(`/api/orders/${o.id}`, body);
      if (msg) toast(msg);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function locate(list: Order[]) {
    const todo = list.filter((o) => o.mailing_address);
    if (!todo.length) return toast("No addresses to look up.", "error");
    setBusy(true);
    let found = 0;
    for (const o of todo) {
      setLocating(o.id);
      try {
        const p = await geocode(o.mailing_address!);
        if (p) {
          await mutate(`/api/orders/${o.id}`, { action: "set_delivery", delivery_lat: p.lat, delivery_lng: p.lng });
          found++;
        }
      } catch {
        /* keep going; reported below */
      }
    }
    setLocating(null);
    setBusy(false);
    toast(
      found === todo.length ? `Located ${found} address${found === 1 ? "" : "es"}` : `Located ${found} of ${todo.length}. Set the rest by hand.`,
      found === todo.length ? "success" : "error",
    );
  }

  const totalKm = view.trips.reduce((a, t) => a + t.km, 0);
  const totalMin = view.trips.reduce((a, t) => a + t.minutes, 0);

  return (
    <>
      <PageHeader
        title="Deliveries"
        subtitle="Choose how each order gets there. SeedFlow plans the shortest drop-off route for you."
        actions={
          <>
            <Button onClick={() => window.print()} disabled={!view.trips.length}>
              <Printer size={16} /> Print route
            </Button>
            <Button onClick={() => setEditDepot(true)}>
              <Settings2 size={16} /> Route settings
            </Button>
          </>
        }
      />

      <Card className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
        <span className="flex items-center gap-2">
          <MapPinned size={16} className="text-forest-600" />
          Start: <strong className="text-forest-900">{view.d.depot_name}</strong>
          {view.d.depot_address && <span className="text-muted">· {view.d.depot_address}</span>}
          {!view.depot && <Badge tone="amber">Set the start point in Route settings</Badge>}
        </span>
        <div className="w-72">
          <Switch label="Include orders still being packed" checked={includePacking} onChange={setIncludePacking} />
        </div>
      </Card>

      {/* 1. How each order is delivered */}
      <Card className="no-print mb-6">
        <CardHeader title="1. How does each order get there?" subtitle={`${view.orders.length} order${view.orders.length === 1 ? "" : "s"} · only Ready orders can be marked delivered`} />
        {view.orders.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No orders to deliver">Approved and packed orders appear here.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-sage-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Address</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Method</th>
                  <th className="px-4 py-2.5 font-medium">Map location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sage-100">
                {view.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/requests/${o.id}`} className="font-medium text-forest-900 hover:underline">
                        #{o.order_number} · {o.organization_name}
                      </Link>
                      <p className="text-xs text-muted">{view.packets(o)} packets</p>
                    </td>
                    <td className="max-w-56 px-4 py-2.5 text-xs text-muted">{o.mailing_address ?? "No address"}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1" role="group" aria-label={`Delivery method for #${o.order_number}`}>
                        {DELIVERY_METHODS.map((m) => (
                          <button
                            key={m}
                           
                            onClick={() => act(o, { action: "set_delivery", delivery_method: o.delivery_method === m ? null : m })}
                            aria-pressed={o.delivery_method === m}
                            className={clsx(
                              "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ring-1 ring-inset",
                              o.delivery_method === m ? "bg-forest-600 text-white ring-forest-600" : "bg-white text-forest-800 ring-sage-200 hover:bg-sage-50",
                            )}
                          >
                            {METHOD_ICON[m]} {DELIVERY_LABELS[m]}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {o.delivery_method !== "drop-off" ? (
                        <span className="text-xs text-muted">Not needed</span>
                      ) : o.delivery_lat !== null ? (
                        <button className="flex items-center gap-1 text-xs text-forest-700 hover:underline" onClick={() => setManual(o)}>
                          <CheckCircle2 size={14} /> Located
                        </button>
                      ) : locating === o.id ? (
                        <span className="text-xs text-muted">Looking up…</span>
                      ) : (
                        <span className="flex gap-1">
                          <Button size="sm" onClick={() => locate([o])} disabled={busy || !o.mailing_address}>
                            <MapPin size={13} /> Find
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setManual(o)}>
                            Set
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view.unlocated.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sage-100 px-5 py-3 text-sm">
            <span className="text-amber-800">
              {view.unlocated.length} drop-off order{view.unlocated.length === 1 ? " needs" : "s need"} a map location before it can be routed.
            </span>
            <Button size="sm" variant="primary" onClick={() => locate(view.unlocated)} disabled={busy}>
              <MapPin size={14} /> Find all on map
            </Button>
          </div>
        )}
        <p className="border-t border-sage-100 px-5 py-2 text-[11px] text-muted">
          “Find” looks up the mailing address with OpenStreetMap from your browser. You can also paste coordinates from Google Maps with “Set”.
        </p>
      </Card>

      {/* 2. Best route */}
      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold text-forest-900">
            <Navigation size={18} /> 2. Best drop-off route
          </h2>
          {view.trips.length > 0 && (
            <p className="text-sm text-muted">
              {view.trips.length} trip{view.trips.length === 1 ? "" : "s"} · about {totalKm.toFixed(1)} km · {fmtMinutes(totalMin)} driving + stops
            </p>
          )}
        </div>
        {!view.depot ? (
          <EmptyState title="Set a start point first">Open Route settings and enter where deliveries leave from.</EmptyState>
        ) : view.trips.length === 0 ? (
          <EmptyState title="No drop-offs to route">Mark orders as Drop-off and locate their addresses above.</EmptyState>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {view.trips.map((trip, ti) => {
              const link = googleMapsLink(view.depot!, trip.stops, view.d.return_to_depot);
              return (
                <Card key={ti} className="print-area break-inside-avoid">
                  <div className="flex items-start justify-between gap-3 border-b border-sage-100 px-5 py-4">
                    <div>
                      <p className="font-semibold text-forest-900">
                        Trip {ti + 1} · {trip.stops.length} stop{trip.stops.length === 1 ? "" : "s"}
                      </p>
                      <p className="text-xs text-muted">
                        ≈ {trip.km.toFixed(1)} km · {fmtMinutes(trip.minutes)} · {trip.stops.reduce((a, s) => a + view.packets(s.data), 0)} packets
                      </p>
                    </div>
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer" className={`no-print ${buttonCls("primary", "sm")}`}>
                        <ExternalLink size={13} /> Open in Google Maps
                      </a>
                    )}
                  </div>
                  <ol className="px-5 py-3 text-sm">
                    <RouteStop n="S" title={view.d.depot_name} sub="Start" />
                    {trip.stops.map((s, i) => (
                      <RouteStop
                        key={s.id}
                        n={String(i + 1)}
                        km={trip.legs[i].km}
                        title={`#${s.data.order_number} · ${s.data.organization_name}`}
                        sub={s.data.mailing_address ?? ""}
                        action={
                          s.data.status === "Ready" ? (
                            <Button size="sm" onClick={() => act(s.data, { action: "deliver" }, `#${s.data.order_number} delivered`)}>
                              <Truck size={13} /> Delivered
                            </Button>
                          ) : (
                            <StatusBadge status={s.data.status} />
                          )
                        }
                      />
                    ))}
                    {view.d.return_to_depot && <RouteStop n="E" km={trip.legs[trip.legs.length - 1].km} title={view.d.depot_name} sub="Back to start" last />}
                  </ol>
                </Card>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">
          Distances are straight-line estimates × {1.3} for roads; Google Maps gives exact driving times. Trips hold up to {view.d.max_stops_per_trip} stops.
        </p>
      </section>

      {/* 3. Mail & pickup */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SimpleList
          title="By mail"
          icon={<Mail size={16} />}
          orders={view.mail}
          packets={view.packets}
          empty="No orders going by mail"
          onDone={(o) => act(o, { action: "deliver" }, `#${o.order_number} marked as sent`)}
          doneLabel="Sent"
        />
        <SimpleList
          title="Pickup"
          icon={<Store size={16} />}
          orders={view.pickup}
          packets={view.packets}
          empty="No pickups"
          onDone={(o) => act(o, { action: "deliver" }, `#${o.order_number} picked up`)}
          doneLabel="Picked up"
        />
      </div>
      {view.undecided.length > 0 && (
        <p className="no-print mt-4 text-sm text-amber-800">
          <Package size={14} className="mr-1 inline" />
          {view.undecided.length} order{view.undecided.length === 1 ? " has" : "s have"} no delivery method yet: choose one in step 1.
        </p>
      )}

      <Modal open={manual !== null} onClose={() => setManual(null)} title={manual ? `Map location — #${manual.order_number}` : ""}>
        {manual && <ManualLocation order={manual} onDone={() => setManual(null)} />}
      </Modal>
      <Modal open={editDepot} onClose={() => setEditDepot(false)} title="Route settings">
        {editDepot && <RouteSettings d={view.d} onDone={() => setEditDepot(false)} />}
      </Modal>
    </>
  );
}

function fmtMinutes(m: number) {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h ? `${h} h ${min} min` : `${min} min`;
}

function RouteStop({ n, title, sub, km, action, last }: { n: string; title: string; sub?: string; km?: number; action?: React.ReactNode; last?: boolean }) {
  const endpoint = n === "S" || n === "E";
  return (
    <li className="relative flex gap-3 pb-3">
      {!last && n !== "E" && <span className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-forest-200" />}
      <span
        className={clsx(
          "z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
          endpoint ? "bg-forest-100 text-forest-800" : "bg-forest-600 text-white",
        )}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-forest-900">{title}</p>
            {sub && <p className="truncate text-xs text-muted">{sub}</p>}
          </div>
          <span className="no-print shrink-0">{action}</span>
        </div>
        {km !== undefined && <p className="text-[11px] text-muted">+{km.toFixed(1)} km</p>}
      </div>
    </li>
  );
}

function SimpleList({
  title,
  icon,
  orders,
  packets,
  empty,
  onDone,
  doneLabel,
}: {
  title: string;
  icon: React.ReactNode;
  orders: Order[];
  packets: (o: Order) => number;
  empty: string;
  onDone: (o: Order) => void;
  doneLabel: string;
}) {
  return (
    <Card className="no-print">
      <CardHeader title={`${title} (${orders.length})`} action={<span className="text-forest-500">{icon}</span>} />
      {orders.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-sage-100">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-forest-900">
                  #{o.order_number} · {o.organization_name}
                </p>
                <p className="truncate text-xs text-muted">
                  {packets(o)} packets{o.mailing_address ? ` · ${o.mailing_address}` : ""}
                </p>
              </div>
              {o.status === "Ready" ? (
                <Button size="sm" onClick={() => onDone(o)}>
                  <CheckCircle2 size={13} /> {doneLabel}
                </Button>
              ) : (
                <StatusBadge status={o.status} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ManualLocation({ order, onDone }: { order: Order; onDone: () => void }) {
  const { mutate, toast } = useData();
  const [text, setText] = useState(order.delivery_lat !== null ? `${order.delivery_lat}, ${order.delivery_lng}` : "");
  const parsed = parseLatLng(text);
  async function save(clear = false) {
    try {
      await mutate(`/api/orders/${order.id}`, {
        action: "set_delivery",
        delivery_lat: clear ? null : parsed!.lat,
        delivery_lng: clear ? null : parsed!.lng,
      });
      toast(clear ? "Location cleared" : "Location saved");
      onDone();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }
  return (
    <div className="space-y-4 text-sm">
      {order.mailing_address && <p className="rounded-xl bg-sage-50 p-3">{order.mailing_address}</p>}
      <Field label="Coordinates (latitude, longitude)" hint="Tip: right-click the place in Google Maps and click the numbers to copy them." error={text && !parsed ? "Use the format 45.4215, -75.6972" : undefined}>
        <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="45.4215, -75.6972" autoFocus />
      </Field>
      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={() => save(true)} disabled={order.delivery_lat === null}>
          Clear location
        </Button>
        <span className="flex gap-2">
          <Button onClick={onDone}>Cancel</Button>
          <Button variant="primary" onClick={() => save()} disabled={!parsed}>
            Save
          </Button>
        </span>
      </div>
    </div>
  );
}

function RouteSettings({ d, onDone }: { d: AppSettings["delivery"]; onDone: () => void }) {
  const { mutate, toast } = useData();
  const [f, setF] = useState({
    depot_name: d.depot_name,
    depot_address: d.depot_address ?? "",
    coords: d.depot_lat !== null ? `${d.depot_lat}, ${d.depot_lng}` : "",
    max_stops_per_trip: String(d.max_stops_per_trip),
    avg_speed_kmh: String(d.avg_speed_kmh),
    minutes_per_stop: String(d.minutes_per_stop),
    return_to_depot: d.return_to_depot,
  });
  const [finding, setFinding] = useState(false);
  const coords = parseLatLng(f.coords);

  async function find() {
    if (!f.depot_address.trim()) return;
    setFinding(true);
    try {
      const p = await geocode(f.depot_address);
      if (p) setF((x) => ({ ...x, coords: `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}` }));
      else toast("Address not found. Paste coordinates instead.", "error");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setFinding(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await mutate(
        "/api/settings",
        {
          delivery: {
            depot_name: f.depot_name,
            depot_address: f.depot_address || null,
            depot_lat: coords?.lat ?? null,
            depot_lng: coords?.lng ?? null,
            max_stops_per_trip: Number(f.max_stops_per_trip),
            avg_speed_kmh: Number(f.avg_speed_kmh),
            minutes_per_stop: Number(f.minutes_per_stop),
            return_to_depot: f.return_to_depot,
          },
        },
        "PATCH",
      );
      toast("Route settings saved");
      onDone();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form onSubmit={save} className="grid gap-4 text-sm sm:grid-cols-2">
      <Field label="Start point name" className="sm:col-span-2">
        <input className={inputCls} value={f.depot_name} onChange={set("depot_name")} />
      </Field>
      <Field label="Start address" className="sm:col-span-2">
        <div className="flex gap-2">
          <input className={inputCls} value={f.depot_address} onChange={set("depot_address")} />
          <Button type="button" onClick={find} disabled={finding || !f.depot_address.trim()}>
            <MapPin size={14} /> Find
          </Button>
        </div>
      </Field>
      <Field label="Start coordinates" className="sm:col-span-2" error={f.coords && !coords ? "Use the format 45.4215, -75.6972" : undefined}>
        <input className={inputCls} value={f.coords} onChange={set("coords")} placeholder="45.4215, -75.6972" />
      </Field>
      <Field label="Max stops per trip">
        <input className={inputCls} inputMode="numeric" value={f.max_stops_per_trip} onChange={set("max_stops_per_trip")} />
      </Field>
      <Field label="Minutes per stop">
        <input className={inputCls} inputMode="numeric" value={f.minutes_per_stop} onChange={set("minutes_per_stop")} />
      </Field>
      <Field label="Average driving speed (km/h)">
        <input className={inputCls} inputMode="decimal" value={f.avg_speed_kmh} onChange={set("avg_speed_kmh")} />
      </Field>
      <div className="pt-6">
        <Switch label="Return to start" checked={f.return_to_depot} onChange={(v) => setF((x) => ({ ...x, return_to_depot: v }))} />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!!f.coords && !coords}>
          Save
        </Button>
      </div>
    </form>
  );
}
