# 🌱 SeedFlow — YFS Seed Management System

**From seed requests to community growth.**
Built for **Youth in Food Systems** (a program of Seeds of Diversity Canada) at **CommuniHacks 2026, Challenge 3: Seed Request, Inventory and Order Management System**.

> ⚠️ **All inventory quantities in this repo are fictional demo data.** YFS confirmed it doesn't yet have a structured seed inventory, so SeedFlow lets staff build one from scratch. All schools, names, emails and addresses in the demo data are made up. The real Cognito form PDFs were used only to understand the form's fields. Nothing from them is copied here.
>
> This is a hackathon prototype. It isn't an official or endorsed YFS service.

SeedFlow replaces a manual, fragmented process with one connected workflow:

```
Request → Review → Inventory check → Approval (reserve) → Packing → Ready → Delivery (deduct)
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
| **Dashboard** | Stock totals (counted items only), alerts, distribution by category, requests over time and recent activity. CSV exports for inventory, orders and stock history. |
| **Cognito Forms** | An adapter boundary, a status page and an optional secret-protected webhook. **No live API calls**, because Cognito's REST API wasn't verified and no credentials were available. Import CSV/JSON exports instead. |

## Running and deploying on Cloudflare

SeedFlow runs on Cloudflare Workers with a D1 (SQLite) database bound as `DB`. The schema is in `migrations/`. A new database starts empty, which is what real use needs. **Settings → Reset demo data** loads the fictional dataset unless `SEEDFLOW_DISABLE_DEMO_RESET=true`.

Every inventory change is one atomic D1 batch guarded by a compare-and-swap on `store_meta.version`, so a stale writer is rolled back and re-checked against current stock (see [`ARCHITECTURE.md`](ARCHITECTURE.md)).

### Local development

**On a Mac:** double-click **`Start SeedFlow.command`**. It installs everything on first run (Node 20+ required) and opens http://localhost:3000. If macOS says it's from an unidentified developer, right-click it and choose **Open**.

Or from a terminal:

```bash
npm install
npx cf d1 migrations apply 94072807-2577-41ea-b804-8ca9b20210ee --local --persist-to .cloudflare/state
npm run dev
```

Open http://localhost:3001. That ID is the one in `cloudflare.config.ts`; `--local` only touches the database on your machine. To test a production build, run `npm run build` and `npm start`.

### Deployment

Production is at https://seedflow.space (Worker and D1 database both named `seedflow`). Workers Builds deploys every push to `main`: it runs `npm run deploy:ci`, which applies new migrations and then deploys. Follow a build in the Cloudflare dashboard under **seedflow → Deployments**.

Open pages check `/api/version` every 10 seconds. A data change reloads the data, and a new deployment offers a **Reload** prompt.

**Public form abuse protection is best effort.** `/request` is open to anyone. Submissions are validated on the server, limited in size, checked against real seed IDs, and screened with a hidden honeypot field. IP rate limiting uses the Cloudflare Workers Rate Limiting binding `PUBLIC_FORM_LIMITER` (declared in `cloudflare.config.ts`) when present, falling back to an in-memory counter that only protects a single Worker instance. Cloudflare's limiter counts per location and is eventually consistent, so this is a coarse brake, not production-grade abuse prevention. If a deploy rejects the binding, remove that one line.

**Season dates** shown on the public form live in `src/lib/season.ts`. They are the 2026 spring dates and are marked historical until YFS confirms a new window; update that file and set `applicationsOpen` when it does.

### Staff sign-in

Only YFS staff can open the panel. Every page and API is locked by `src/proxy.ts` except the public form (`/request`, `/api/public/*`), `/login`, the Cognito webhook and `/api/version`, so requester emails and mailing addresses are visible only to signed-in staff.

- **First account in production (no Cloudflare access needed):** open https://seedflow.space/login. While no staff accounts exist, it asks for the **one-time setup code** (given to the team privately; only its SHA-256 is in `cloudflare.config.ts`). Enter it with your email and a password of your choice. Setup then closes for good, and everyone else is added from Settings.
- **Alternative:** set two secrets on the `seedflow` Worker (dashboard → seedflow → Settings → Variables and Secrets, type **Secret**): `SEEDFLOW_ADMIN_EMAIL` and `SEEDFLOW_ADMIN_PASSWORD` (10+ characters). The first sign-in with those creates the admin account; later changes to the secrets don't touch existing accounts. Without them the sign-in page says the panel isn't configured and stays locked.
- **More staff:** Settings → Staff accounts → Add a staff member (email + starting password). Staff can change their own password there, which signs out their other devices. Removing an account ends its sessions immediately.
- **Locally:** with no accounts and no secrets, `/login` on localhost offers a one-time "create the first staff account" form.
- **How it's stored:** passwords are salted PBKDF2-SHA256 (100,000 iterations). Sessions are random 256-bit tokens in an HttpOnly, Secure, SameSite=Lax `__Host-` cookie, valid 12 hours; only a SHA-256 hash of each token is in D1. Sign-in allows 10 attempts per 15 minutes per email and per IP (per Worker instance).

`SEEDFLOW_DISABLE_DEMO_RESET` is on in `cloudflare.config.ts`, so **Reset demo data** can't wipe the live database.

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

- `npm test`: all passing, including concurrent approvals, double-clicked approve and deliver, concurrent duplicate imports, a 1,000-order atomic import, route planning, bundles and settings. Store tests run on Miniflare's D1.
- The full flow also passes on the production build served by local workerd: parallel approvals, double delivery and a 300-order import.
- With the compare-and-swap guard disabled, the five concurrency tests fail, so they do exercise it.

## Known limitations

- **Route distances are estimates:** straight-line distance × 1.3. Use the Google Maps link for real driving directions. Address lookup uses OpenStreetMap's free service, limited to about one address per second.
- **Email sending** is built for Resend's API but hasn't been tested with a live account. Without a key, notifications are only logged.
- **One staff role.** Every staff account can do everything, including adding and removing staff. There's no password-reset email; another staff member removes and re-adds the account.
- **No live Cognito sync.** The adapter refuses to guess endpoints. Import exports instead, and finish `src/lib/integrations/cognito.ts` once the API is confirmed.
- **Partial fulfilment isn't supported.** Orders are delivered in full; to send less, change approved quantities during review. Marked as future work.
- Seed name matching only auto-links exact, unambiguous names. Everything else waits for staff, by design.
- Every write reads the seeds, orders and order items tables. That's fine at YFS's scale (hundreds of orders) but should be narrowed if it grows.

## Docs

- [`DEMO.md`](DEMO.md): three-minute demo script
- [`ARCHITECTURE.md`](ARCHITECTURE.md): how the workflow, data model and safety guarantees fit together

## Tech

Next.js API on vinext (App Router) · TypeScript · Tailwind CSS 4 · Cloudflare Workers · Cloudflare D1 · Zod · React Hook Form · Recharts · Papa Parse · Lucide · Vitest
