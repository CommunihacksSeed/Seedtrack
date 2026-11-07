# 🌱 SeedFlow — YFS Seed Management System

**From seed requests to community growth.**
Built for **Youth in Food Systems** (a program of Seeds of Diversity Canada) at **CommuniHacks 2026, Challenge 3: Seed Request, Inventory and Order Management System**.

> ⚠️ **All inventory quantities in this repo are fictional demo data.** YFS confirmed it doesn't yet have a structured seed inventory, so SeedFlow lets staff build one from scratch. All schools, names, emails and addresses in the demo data are made up. The real Cognito form PDFs were used only to understand the form's fields. Nothing from them is copied here.
>
> This is a hackathon prototype. It isn't an official or endorsed YFS service.

SeedFlow replaces a manual, fragmented process with one connected workflow:

```
Request → Review → Inventory check → Approval (reserve) → Packing → Ready → Delivery (deduct) → Reports
```

## Features

| Area | What it does |
| --- | --- |
| **Seed Inventory** | Add, edit, search and filter seeds. Record stock counts. Physical, reserved and available counts are shown side by side. Low-stock thresholds, per-seed movement history, CSV import (preview + validation) and CSV export. **Unknown stock (“Needs Stock Count”) is never treated as 0** and can't be allocated. |
| **Seed Requests** | Enter requests by hand, or import CSV/JSON (Cognito exports) with column mapping, row-by-row validation, preview and **duplicate detection by Cognito Entry ID**. Requests without packet quantities import fine; staff decide quantities during review. |
| **Review & approval** | Match each requested seed to inventory (exact unique matches are automatic; unclear ones are flagged **“Inventory Match Required”**). Set approved quantities, mark items unavailable and add varieties to fill a bundle. Approval **reserves stock atomically** and fails cleanly if anything is short. |
| **Packing Queue** | Organized **by seed** by default: total packets needed per seed across all approved orders, split by order, with one-click **Pack all** and a printable pick list sorted by shelf. A **By order** view, steward assignment, per-order packing slips (no contact details) and Mark Ready once everything is packed. |
| **Deliveries** | Choose drop-off, mail or pickup for each order. Drop-off addresses are located on the map (OpenStreetMap lookup or pasted coordinates). SeedFlow plans the **shortest route** from your start point (nearest-neighbour + 2-opt), splits long runs into trips, estimates km and time, and opens each trip in Google Maps. You can print the route sheet and mark stops delivered as you go. |
| **Notifications** | **Off by default.** Turn them on in Settings and choose the events: new request (to staff), approved / packed / delivered (to the requester), and low stock (to staff). Every message is kept in a log. Real emails go out only if an email service (Resend) is configured. |
| **Bundles & suggestions** | Define what each bundle (Spring, Fall Harvest, Herbs…) contains, then add a bundle's seeds to a request with one click. An optional rule pre-fills suggested packets when the requester gave no quantity (fixed amount or per number of students). Staff still confirm every number. |
| **Fulfilment** | Delivering deducts physical stock and releases the reservation **exactly once**. Cancelling releases reservations without touching physical stock. |
| **Dashboard & Reports** | Stock totals (counted items only), alerts, orders by status, distribution by category and organization, requests over time, outstanding orders and recent activity. CSV exports for inventory, orders, distribution and stock history. |
| **Cognito Forms** | An adapter boundary, a status page and an optional secret-protected webhook. **No live API calls**, because Cognito's REST API wasn't verified and no credentials were available. Import CSV/JSON exports instead. |

## Quick start (no database needed)

```bash
npm install
npm run dev
# open http://localhost:3000
```

Without Supabase settings, SeedFlow runs on a **local demo store**: a JSON file at `.data/seedflow.json`. It's created with the demo dataset on first run. It applies the same business rules as the database, and changes persist across refreshes. Use **Settings → Reset demo data** before presenting.

The local store is for development and demos only. It's safe only with a single server process, and on serverless hosts it can be wiped.

## Running on Supabase (real persistence)

1. Create a Supabase project.
2. In the SQL editor, run the migrations in order:
   `supabase/migrations/0001_schema.sql`, `0002_functions.sql`, `0003_demo_reset.sql`, `0004_settings_bundles_delivery.sql`
   (or use `supabase db push` with the Supabase CLI).
3. Optional: load the demo data by running `supabase/seed.sql`. To regenerate it, run `npm run db:seed-sql`.
4. Copy `.env.example` to `.env.local` and set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SEEDFLOW_ADMIN_KEY`.
5. `npm run dev`. The banner disappears and Settings shows “Supabase PostgreSQL”.

All inventory changes go through PostgreSQL functions (`sf_approve_order`, `sf_deliver_order`, `sf_cancel_order`, `sf_set_stock`, …). Each one runs as a single transaction that locks the affected rows. Row Level Security is on with no anonymous or authenticated access. Only the server's service role can read or write.

## Deploying (e.g. Vercel)

Set the environment variables from `.env.example`. **Always set `SEEDFLOW_ADMIN_KEY`.** Without it, a production deployment is read-only and hides requester contact details. Use Supabase for any shared deployment, because the local demo store doesn't persist on serverless hosts.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Unit and acceptance tests for the business rules and local store (Vitest) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `DATABASE_URL=… npm run test:sql` | SQL acceptance tests against a Postgres database with the migrations applied (runs in a rolled-back transaction) |
| `DATABASE_URL=… bash supabase/tests/concurrency.sh` | Two real concurrent sessions compete for the same stock (**scratch database only**: it truncates tables) |
| `npm run db:seed-sql` | Regenerate `supabase/seed.sql` from the demo dataset |

## Environment variables

See [`.env.example`](.env.example). Nothing is required for local development.

## Test results

Verified while building (Node 22, PostgreSQL 16):

- `npm test`: 27/27 passing (business rules, local store, route planning, bundles, settings, suggestions). This covers acceptance tests 1–10 from the spec against the domain rules and local store, including concurrent approvals and persistence.
- `supabase/tests/acceptance.sql`: all SQL acceptance tests pass against the real migrations (allocation, over-allocation, delivery, cancellation, duplicate delivery, unknown stock, missing quantities, duplicate entry IDs).
- `supabase/tests/concurrency.sh`: passes. Two simultaneous 30-packet approvals against 50 packets: one succeeds, the other is refused with “Insufficient stock”, and 30 stay reserved.
- `npm run build`, `tsc` and `eslint` are clean. The full demo script was clicked through in a headless browser (approve 50 → 40 available, deliver 50 → 40 physical, persists after refresh, shows in Reports).

The SQL was tested on plain PostgreSQL 16. The Supabase adapter (`src/lib/store/supabase.ts`) calls those same functions through `supabase-js`, but it hasn't been run against a live Supabase project yet.

## Known limitations

- **Route distances are estimates:** straight-line distance × 1.3. Use the Google Maps link for real driving directions. Address lookup uses OpenStreetMap's free service, limited to about one address per second.
- **Email sending** is built for Resend's API but hasn't been tested with a live account. Without a key, notifications are only logged.
- **Staff access is a shared key**, not individual logins. Replace it with Supabase Auth (per-user roles) before handling real requester data.
- **No live Cognito sync.** The adapter refuses to guess endpoints. Import exports instead, and finish `src/lib/integrations/cognito.ts` once the API is confirmed.
- **Partial fulfilment isn't supported.** Orders are delivered in full; to send less, change approved quantities during review. Marked as future work.
- Seed name matching only auto-links exact, unambiguous names. Everything else waits for staff, by design.
- The local demo store isn't concurrency-safe across multiple server instances.

## Docs

- [`DEMO.md`](DEMO.md): three-minute demo script
- [`ARCHITECTURE.md`](ARCHITECTURE.md): how the workflow, data model and safety guarantees fit together

## Tech

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase PostgreSQL · Zod · React Hook Form · Recharts · Papa Parse · Lucide · Vitest
