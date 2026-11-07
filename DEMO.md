# SeedFlow: three-minute demo

**Before you start:** Settings → **Reset demo data**. Keep two tabs ready: *Seed Inventory* and *Seed Requests*.

## 0:00 — The problem (20s)

“YFS gets seed requests through Cognito Forms. Staff then check them by hand against inventory that, as they told us, isn't tracked anywhere structured. Youth Seed Stewards pack orders from scattered notes. SeedFlow connects all of it, and it can start from zero inventory.”

## 0:20 — Dashboard (20s)

- Point at the **Demo Mode** banner: all numbers are fictional.
- Stock cards count **counted items only**. *Uncounted inventory* shows Basil: “Unknown is not zero, so we never allocate seeds nobody has counted.”
- Low-stock alerts, orders by status, recent activity.

## 0:40 — Inventory (25s)

- **Seed Inventory**: Tomato — Crimson Giant shows **Physical 50 · Reserved 0 · Available 50**.
- Click **Count** on Basil to show how staff build inventory from scratch (or **Import CSV**).
- Open the history icon on any row: every change is logged.

## 1:05 — Review a real-shaped request (35s)

- **Seed Requests → #1006 Maple Grove Public School.** It's shaped like a real Cognito entry: bundles plus varieties with **no quantities**.
- Point out the flags: *Approved quantity needed*, *Stock Count Required* (Basil), *Inventory Match Required* (Cherokee Purple Tomato isn't in stock).
- “The system flags what it can't decide instead of guessing.”

## 1:40 — Approve (25s)

- Open **#1004 Riverside Community School** (10 tomato + 5 kale). Click **Approve & reserve**.
- Switch to Inventory: Tomato is **Physical 50 · Reserved 10 · Available 40**. Physical stock hasn't moved, because nothing has left the shelf yet.
- Optional: approve again from another tab. It's refused, so stock is never reserved twice. (Over-allocation is refused the same way.)

## 2:05 — Pack (30s)

- **Packing Queue** opens **By seed**: each card shows one seed, the total packets needed across all approved orders, and how many go to each order. Stewards pull each seed once.
- Click **Pack all** on Tomato and Kale. **Print pick list** gives the same view on paper.
- Under **Orders with everything packed**, open the order's **Slip** (no requester contact details), then **Mark ready**. Ready only works once every item is packed.
- **By order** switches back to one card per order.

## 2:35 — Deliver (20s)

- **Deliveries**: every drop-off order is already on the map. SeedFlow shows the **best route** from the seed hub, with km, time and stop order. Click **Open in Google Maps** to drive it.
- Mark #1004 **Delivered** from the route. Inventory now shows Tomato **Physical 40 · Reserved 0 · Available 40**.
- Refresh the page: the numbers persist.

## 2:50 — Reports (10s)

- **Reports**: #1004 is under completed orders, and distribution by category and organization updated. Export any table to CSV.

**Close:** “Every stock change is one atomic database write that's rejected and re-checked if inventory changed in the meantime. We tested simultaneous approvals fighting over the same stock: one fails cleanly and nothing is over-reserved.”

## If there's extra time

- **Settings → Notifications**: flip the switch on, approve an order, and the requester's message appears in the log. It's off by default, and staff choose which events send messages.
- **#1006 review**: click **Add Spring seeds** to expand a bundle, and see the **Suggested** quantities (1 packet per 10 students).

## Likely judge questions

- **Where does inventory come from?** Staff enter counts or import a CSV. Unknown counts stay unknown until someone counts them.
- **What if the request has no quantities?** It imports anyway, and staff choose approved quantities during review.
- **Duplicate Cognito submissions?** The Cognito Entry ID is unique, so re-importing the same export is safe.
- **Real data?** None is used. The demo data is fictional, and contact details are hidden from anyone without the staff key.
