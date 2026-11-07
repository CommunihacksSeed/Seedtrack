"use client";

import { useState } from "react";
import { Database, KeyRound, PlugZap, RotateCcw } from "lucide-react";
import { getStaffKey, setStaffKey, useData } from "@/components/data-provider";
import { Badge, Button, Card, CardHeader, Field, Loading, Modal, PageHeader, inputCls } from "@/components/ui";

export default function SettingsPage() {
  const { state, mutate, refresh, toast } = useData();
  const [key, setKey] = useState(() => (typeof window === "undefined" ? "" : getStaffKey()));
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!state) return <Loading />;

  async function sync() {
    try {
      const res = await mutate<{ ok: boolean; message?: string; fetched?: number }>("/api/integrations/cognito/sync");
      toast(res.ok ? `Fetched ${res.fetched} entries` : (res.message ?? "Not configured"), res.ok ? "success" : "error");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Data storage, staff access and integrations." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Data storage" action={<Database size={18} className="text-forest-500" />} />
          <div className="space-y-3 p-5 text-sm">
            {state.mode === "supabase" ? (
              <>
                <Badge tone="green">Supabase PostgreSQL</Badge>
                <p className="text-muted">
                  Connected. Approvals, deliveries and cancellations run as single database transactions that lock the affected inventory rows, so stock can&apos;t be reserved twice.
                </p>
              </>
            ) : (
              <>
                <Badge tone="amber">Local demo store</Badge>
                <p className="text-muted">
                  Supabase isn&apos;t configured, so data is kept in a JSON file on the server. It applies the same business rules, but it isn&apos;t a production database:
                  it&apos;s only safe on a single server and may be wiped on serverless hosting. Set <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> to switch.
                </p>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Staff access" action={<KeyRound size={18} className="text-forest-500" />} />
          <div className="space-y-3 p-5 text-sm">
            <p>
              {state.authMode === "open-dev" && (
                <>
                  <Badge tone="amber">Development mode</Badge> No staff key is configured, so changes are allowed because this is a development server. Set{" "}
                  <code>SEEDFLOW_ADMIN_KEY</code> before deploying.
                </>
              )}
              {state.authMode === "read-only" && (
                <>
                  <Badge tone="slate">Read-only</Badge> This deployment has no staff key configured, so all changes are disabled.
                </>
              )}
              {state.authMode === "key" && (state.staff ? <Badge tone="green">Signed in as staff</Badge> : <Badge tone="gray">View-only</Badge>)}
            </p>
            {state.authMode === "key" && (
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setStaffKey(key.trim());
                  await refresh();
                  toast(key.trim() ? "Staff key saved on this device" : "Staff key removed");
                }}
              >
                <Field label="Staff key" className="flex-1" hint="Stored only in this browser.">
                  <input className={inputCls} type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
                </Field>
                <Button type="submit" variant="primary" className="mt-6 self-start">
                  Save
                </Button>
              </form>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Cognito Forms" action={<PlugZap size={18} className="text-forest-500" />} />
          <div className="space-y-3 p-5 text-sm">
            <p>
              <Badge tone={state.cognito.apiConfigured ? "blue" : "gray"}>{state.cognito.apiConfigured ? "Credentials present" : "Not configured"}</Badge>{" "}
              <Badge tone={state.cognito.webhookConfigured ? "green" : "gray"}>Webhook {state.cognito.webhookConfigured ? "enabled" : "off"}</Badge>
            </p>
            <p className="text-muted">{state.cognito.message}.</p>
            <p className="text-muted">
              Until live sync is set up, export entries from Cognito Forms and use <strong>Seed Requests → Import CSV / JSON</strong>. Entry IDs are used to skip
              duplicates, so re-importing the same export is safe.
            </p>
            <Button onClick={sync} disabled={!state.staff}>
              Sync now
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Demo data" action={<RotateCcw size={18} className="text-forest-500" />} />
          <div className="space-y-3 p-5 text-sm">
            <p className="text-muted">
              Replace <strong>all</strong> inventory and requests with the fictional demo dataset (Tomato Crimson Giant at 50 packets, three open requests, two past deliveries,
              basil not yet counted). Use this before a demo.
            </p>
            <Button variant="danger" onClick={() => setConfirmReset(true)} disabled={!state.staff}>
              <RotateCcw size={16} /> Reset demo data
            </Button>
          </div>
        </Card>
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset all data?">
        <div className="space-y-4 text-sm">
          <p>
            Every seed, request and stock movement will be deleted and replaced with fictional demo data.{" "}
            {state.mode === "supabase" && <strong className="text-red-700">This deletes real database records.</strong>}
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await mutate("/api/demo/reset");
                  toast("Demo data restored");
                  setConfirmReset(false);
                } catch (e) {
                  toast((e as Error).message, "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reset everything
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
