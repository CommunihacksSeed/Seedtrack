"use client";

import { useState } from "react";
import { Database, PlugZap, RotateCcw } from "lucide-react";
import { useData } from "@/components/data-provider";
import { Badge, Button, Card, CardHeader, Loading, Modal } from "@/components/ui";

export function SystemTab() {
  const { state, mutate, toast } = useData();
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
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Data storage" action={<Database size={18} className="text-forest-500" />} />
          <div className="space-y-3 p-5 text-sm">
            <Badge tone="green">Cloudflare D1</Badge>
            <p className="text-muted">
              Connected. Approvals, deliveries and cancellations commit as a single atomic write that&apos;s rejected and re-checked if inventory changed in the meantime, so stock can&apos;t be reserved twice.
            </p>
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
            <Button onClick={sync}>
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
            <Button variant="danger" onClick={() => setConfirmReset(true)}>
              <RotateCcw size={16} /> Reset demo data
            </Button>
          </div>
        </Card>
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset all data?">
        <div className="space-y-4 text-sm">
          <p>
            Every seed, request and stock movement will be deleted and replaced with fictional demo data.{" "}
            <strong className="text-red-700">This deletes real database records.</strong>
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
