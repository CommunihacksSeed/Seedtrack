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
   └── d1.ts        → runs src/lib/domain.ts on a copy, commits changed rows with a compare-and-swap
```

- **One source of business rules.** `src/lib/domain.ts` holds the rules as pure functions over a snapshot. `src/lib/store/d1.ts` applies them and persists the result.
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

## Concurrency and idempotency

D1 has no stored procedures, row locks or interactive transactions. Its atomic unit is `db.batch()`, which can't branch on what it reads. Each write therefore works like this:

1. Read `store_meta.version` with the seeds, orders and order items in one batch.
2. Run the domain function on a copy. A rule violation throws before anything is written.
3. Send one batch: a compare-and-swap, then only the changed rows. If `version` has moved, the first statement sets it to -1, which violates the `store_meta_cas` CHECK and rolls back the batch.
4. On a conflict, retry from fresh data, so rules are re-checked against the stock the other writer left. After 12 attempts the request fails with “busy”.

Bulk imports use `store.transact()` so a whole file is one write. Looping over single-row methods would hit the D1 per-invocation query limit (50 on Workers Free, 1,000 on Paid).

CHECK constraints are a second safety net: even a buggy code path can't commit `reserved > physical`.

## Imports and Cognito Forms

- `src/lib/import-mapping.ts` maps any source row (CSV, JSON or webhook) to an `OrderInput`. Column names are guessed from the labels on the 2026 YFS form, but **staff confirm the mapping** in the UI before anything is saved. Seed lists accept `Kale`, `Kale x5`, `Kale (5)`, `5 x Kale`, separated by `;`, `,`, `|` or newlines.
- The import screen shows row-level errors and duplicates (same Entry ID already in the system or repeated in the file) before you confirm. The server validates every row again.
- `src/lib/integrations/cognito.ts` defines the `CognitoAdapter` interface and reports “Cognito Forms integration not configured”. It **makes no live calls**, because the endpoint format wasn't verified. The webhook route is off unless `COGNITO_WEBHOOK_SECRET` is set, and then every call must present the secret.

## Security model (prototype)

- D1 is reachable only through the Worker's `DB` binding. Cognito secrets live only in Worker secrets.
- Staff writes, and any read of requester email or address, need `SEEDFLOW_ADMIN_KEY` (checked server-side with a timing-safe compare). Without a key, production builds are read-only.
- Packing slips and the non-staff API never include contact details. CSV exports guard against spreadsheet formula injection.
- **Next step:** replace the shared key with per-user login and roles (staff vs. Seed Steward).

## Where things live

```
src/app/                 pages (dashboard, inventory, requests, packing, reports, settings) + api/
src/components/          app shell, data provider, UI kit
src/lib/domain.ts        business rules (D1 store + tests)
src/lib/store/           store interface, D1 store
src/lib/import-mapping.ts, integrations/cognito.ts
migrations/              D1 schema
tests/                   Vitest tests (domain rules, D1 store on Miniflare)
public/templates/        CSV/JSON import templates
```
