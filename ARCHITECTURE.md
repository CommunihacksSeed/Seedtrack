# SeedFlow architecture

## Overview

```
Browser (React client pages)
   │  fetch JSON (+ x-seedflow-key header for staff)
   ▼
Next.js Route Handlers  /api/*          ← zod validation, staff check, error mapping
   │
   ▼
SeedFlowStore interface (src/lib/store)
   ├── supabase.ts  → PostgreSQL functions (one transaction per operation, row locks)
   └── local.ts     → JSON file + in-process lock, running src/lib/domain.ts
```

- **One source of business rules per backend.** `src/lib/domain.ts` holds the rules as pure functions over a snapshot. The local store runs them directly. `supabase/migrations/0002_functions.sql` implements the same rules in SQL. Both are covered by the same acceptance scenarios (`tests/` and `supabase/tests/`).
- **The client never computes stock.** It only displays quantities and sends intents, like “approve order X with these decisions”. The server re-validates everything.
- **Reads** use one endpoint, `GET /api/state`, which returns a snapshot. The UI derives dashboards and reports from it in `src/lib/views.ts`. That's plenty at YFS's scale (hundreds of orders). Paginate if it grows.

## Order lifecycle

```
Received ──► Under Review ──► Approved ──► Preparing ──► Ready ──► Delivered
    │              │              │            │           │
    └──────────────┴──────────────┴────────────┴───────────┴──► Cancelled
```

| Transition | Inventory effect | Guard |
| --- | --- | --- |
| → Approved | `reserved += approved` per seed | Every item has a decision. Allocated items are matched to a **counted** seed. Total demand per seed ≤ available. Not already approved. |
| Approved/Preparing → Ready | none | Every approved item has packed = approved |
| Ready → Delivered | `physical -= approved`, `reserved -= approved` | Status is Ready, so it can't run twice |
| Approved/Preparing/Ready → Cancelled | `reserved -= approved` | Physical stock untouched |
| Received/Under Review → Cancelled | none | — |

Availability is always `physical − reserved`. `physical_quantity = NULL` means **not counted**: it's excluded from totals, shown as “Needs Stock Count”, and can't be reserved.

## Data model

| Table | Purpose |
| --- | --- |
| `seeds` | One row per seed or variety. CHECK constraints enforce `physical ≥ 0`, `0 ≤ reserved ≤ physical`, and `reserved = 0` when physical is unknown. Name + variety is unique (case-insensitive). |
| `orders` | One request. `external_entry_id` (Cognito Entry ID) is UNIQUE, so imports are idempotent. `order_number` is a human-friendly sequence starting at 1001. |
| `order_items` | Requested seed (free text), nullable `requested_quantity`, matched `seed_id` (nullable until staff match it), `approved_quantity` (null = undecided), `packed_quantity`, `unavailable`. |
| `inventory_movements` | Append-only audit log: initial count, adjustment, reservation, release, fulfilment. Records the signed quantity and the resulting physical and reserved values. |
| `order_status_history` | Every status change, with notes. |
| `app_settings` | One JSON settings document: notification switches, suggestion rule, delivery start point and trip settings. Validated in `domain.updateSettings`. |
| `bundles` | Bundle templates: name + `[{seed_id, quantity}]`. `sf_add_bundle_items` adds a bundle's seeds to an order under review. |
| `notification_log` | Every notification composed, with status `sent`, `logged`, `skipped` or `failed`. |
| `orders.delivery_method / delivery_lat / delivery_lng` | Drop-off, mail or pickup, plus map coordinates for route planning (hidden from non-staff). |

## Concurrency and idempotency

Each mutating SQL function:

1. `SELECT … FOR UPDATE` on the order row. This serializes all actions on one order, so a double-clicked “Approve” waits and then sees “already approved”.
2. Locks every affected `seeds` row **in id order**, which avoids deadlocks between orders that share seeds.
3. Checks quantities on the locked rows, then writes stock, the movement log and the status in the same transaction.
4. If anything fails, it raises an exception and the whole transaction rolls back, including any review edits made in that call.

CHECK constraints are a second safety net: even a buggy code path can't commit `reserved > physical`.

`supabase/tests/concurrency.sh` runs two real sessions at once. Session A approves 30 of 50 packets and holds its transaction open. Session B tries 30 at the same moment, blocks on the seed row lock, then sees only 20 available and fails.

The local demo store gets the same effect inside one Node process: it chains every mutation through a promise lock, applies the domain function to a copy and writes the file atomically (temp file + rename).

## Imports and Cognito Forms

- `src/lib/import-mapping.ts` maps any source row (CSV, JSON or webhook) to an `OrderInput`. Column names are guessed from the labels on the 2026 YFS form, but **staff confirm the mapping** in the UI before anything is saved. Seed lists accept `Kale`, `Kale x5`, `Kale (5)`, `5 x Kale`, separated by `;`, `,`, `|` or newlines.
- The import screen shows row-level errors and duplicates (same Entry ID already in the system or repeated in the file) before you confirm. The server validates every row again.
- `src/lib/integrations/cognito.ts` defines the `CognitoAdapter` interface and reports “Cognito Forms integration not configured”. It **makes no live calls**, because the endpoint format wasn't verified. The webhook route is off unless `COGNITO_WEBHOOK_SECRET` is set, and then every call must present the secret.

## Notifications

`src/lib/server/notify.ts`. Route handlers schedule a notification with Next's `after()`, so it never slows down or breaks the staff action. The notification is skipped unless notifications are on **and** that event is switched on. Low-stock alerts fire only when a seed **newly** becomes Low or Out of Stock after an approval, delivery or stock count. Messages are emailed through Resend only if `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` are set; either way they are written to `notification_log`.

## Delivery planning

`src/lib/routing.ts` builds the route with nearest-neighbour construction, then improves it with 2-opt. Distances are haversine × 1.3. Long runs are cut into trips of at most N stops along the optimized tour, and each trip is re-optimized. Address lookup (`src/lib/geocode.ts`) runs in the staff member's browser with OpenStreetMap Nominatim, spaced one second apart. Each trip opens in Google Maps through its public directions URL, so no API key is needed.

## Security model (prototype)

- Supabase service role key and Cognito secrets live only in server environment variables.
- RLS is enabled with no policies for `anon`/`authenticated`. `EXECUTE` on the `sf_*` functions is revoked from public and granted to `service_role` only.
- Staff writes, and any read of requester email or address, need `SEEDFLOW_ADMIN_KEY` (checked server-side with a timing-safe compare). Without a key, production builds are read-only.
- Packing slips and the non-staff API never include contact details. CSV exports guard against spreadsheet formula injection.
- **Next step:** replace the shared key with Supabase Auth and per-user roles (staff vs. Seed Steward).

## Where things live

```
src/app/                 pages (dashboard, inventory, requests, packing, reports, settings) + api/
src/components/          app shell, data provider, UI kit
src/lib/domain.ts        business rules (local store + tests)
src/lib/store/           store interface, local demo store, Supabase store
src/lib/import-mapping.ts, integrations/cognito.ts
supabase/migrations/     schema, transactional functions, demo reset
supabase/tests/          SQL acceptance + concurrency tests
tests/                   Vitest tests
public/templates/        CSV/JSON import templates
```
