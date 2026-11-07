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
| **Fulfilment** | Delivering deducts physical stock and releases the reservation **exactly once**. Cancelling releases reservations without touching physical stock. |
| **Dashboard & Reports** | Stock totals (counted items only), alerts, orders by status, distribution by category and organization, requests over time, outstanding orders and recent activity. CSV exports for inventory, orders, distribution and stock history. |
| **Cognito Forms** | An adapter boundary, a status page and an optional secret-protected webhook. **No live API calls**, because Cognito's REST API wasn't verified and no credentials were available. Import CSV/JSON exports instead. |

## Running and deploying on Cloudflare

SeedFlow runs on Cloudflare Workers with a D1 (SQLite) database bound as `DB`. The schema is in `migrations/`. A new database starts empty, which is what real use needs. **Settings → Reset demo data** loads the fictional dataset unless `SEEDFLOW_DISABLE_DEMO_RESET=true`.

Every inventory change is one atomic D1 batch guarded by a compare-and-swap on `store_meta.version`, so a stale writer is rolled back and re-checked against current stock (see [`ARCHITECTURE.md`](ARCHITECTURE.md)).

### Local development

```bash
npm install
npx cf d1 migrations apply 94072807-2577-41ea-b804-8ca9b20210ee --local --persist-to .cloudflare/state
npm run dev
```

Open http://localhost:3001. That ID is the one in `cloudflare.config.ts`; `--local` only touches the database on your machine. To test a production build, put `SEEDFLOW_ADMIN_KEY=<any value>` in `.dev.vars`, then run `npm run build` and `npm start`.

### Deployment

Production is at https://seedflow.space (Worker and D1 database both named `seedflow`). Sign in with `npx cf auth login`, then run `npm run deploy`. Apply new migrations first with `npx cf d1 migrations apply <database-id>`.

To change the staff key, run `npx wrangler secret put SEEDFLOW_ADMIN_KEY --name seedflow`.

**Always set `SEEDFLOW_ADMIN_KEY`.** Without it, a production deployment is read-only and hides requester contact details. `SEEDFLOW_DISABLE_DEMO_RESET` is on in `cloudflare.config.ts`, so **Reset demo data** can't wipe the live database.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server in workerd on port 3001 |
| `npm run build` / `npm start` | Production build / serve it locally in workerd |
| `npm run deploy` | Build and deploy to Cloudflare Workers |
| `npm test` | Business rules, plus store tests on real D1 semantics through Miniflare (Vitest) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |

## Environment variables

See [`.env.example`](.env.example). Nothing is required for local development.

## Test results

- `npm test`: 28/28 passing, including concurrent approvals, double-clicked approve and deliver, concurrent duplicate imports and a 1,000-order atomic import, all on Miniflare's D1.
- The full flow also passes on the production build served by local workerd: staff key checks, hidden contact details, parallel approvals, double delivery and a 300-order import.
- With the compare-and-swap guard disabled, the five concurrency tests fail, so they do exercise it.

## Known limitations

- **Staff access is a shared key**, not individual logins. Replace it with per-user login and roles before handling real requester data.
- **No live Cognito sync.** The adapter refuses to guess endpoints. Import exports instead, and finish `src/lib/integrations/cognito.ts` once the API is confirmed.
- **Partial fulfilment isn't supported.** Orders are delivered in full; to send less, change approved quantities during review. Marked as future work.
- Seed name matching only auto-links exact, unambiguous names. Everything else waits for staff, by design.
- Every write reads the seeds, orders and order items tables. That's fine at YFS's scale (hundreds of orders) but should be narrowed if it grows.

## Docs

- [`DEMO.md`](DEMO.md): three-minute demo script
- [`ARCHITECTURE.md`](ARCHITECTURE.md): how the workflow, data model and safety guarantees fit together

## Tech

Next.js API on vinext (App Router) · TypeScript · Tailwind CSS 4 · Cloudflare Workers · Cloudflare D1 · Zod · React Hook Form · Recharts · Papa Parse · Lucide · Vitest
