"use client";

import { useState } from "react";
import { Bell, Send } from "lucide-react";
import { useData } from "@/components/data-provider";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Switch, fmtDate, inputCls } from "@/components/ui";
import { NOTIFICATION_EVENTS, NOTIFICATION_EVENT_INFO, type NotificationEvent } from "@/lib/types";

const STATUS_TONE = { sent: "green", logged: "blue", skipped: "gray", failed: "red" } as const;
const STATUS_LABEL = { sent: "Emailed", logged: "Logged only", skipped: "Skipped", failed: "Failed" } as const;

export function NotificationsTab() {
  const { state, mutate, toast } = useData();
  const s = state!.snapshot.settings;
  const staff = state!.staff;
  const [email, setEmail] = useState(s.notifications.staff_email ?? "");
  const [busy, setBusy] = useState(false);

  async function save(patch: object, msg?: string) {
    setBusy(true);
    try {
      await mutate("/api/settings", { notifications: patch }, "PATCH");
      if (msg) toast(msg);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const r = await mutate<{ status: string; recipient: string } | null>("/api/notifications/test");
      toast(r?.status === "sent" ? `Test email sent to ${r.recipient}` : "Test notification added to the log (no email service configured)");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const log = state!.snapshot.notifications.slice(0, 25);
  const orders = new Map(state!.snapshot.orders.map((o) => [o.id, o]));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card>
        <CardHeader title="Notifications" action={<Bell size={18} className="text-forest-500" />} />
        <div className="space-y-5 p-5 text-sm">
          <Switch
            label="Turn on notifications"
            description="Off by default. Staff choose which messages go out."
            checked={s.notifications.enabled}
            disabled={!staff || busy}
            onChange={(v) => save({ enabled: v }, v ? "Notifications turned on" : "Notifications turned off")}
          />

          <div className={s.notifications.enabled ? "" : "pointer-events-none opacity-50"}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Send a message when…</p>
            <div className="space-y-3 rounded-xl border border-sage-200 p-3">
              {NOTIFICATION_EVENTS.map((e: NotificationEvent) => (
                <Switch
                  key={e}
                  label={NOTIFICATION_EVENT_INFO[e].label}
                  description={NOTIFICATION_EVENT_INFO[e].to === "staff" ? "To staff" : "To the requester (if they gave an email)"}
                  checked={s.notifications.events[e]}
                  disabled={!staff || busy}
                  onChange={(v) => save({ events: { [e]: v } })}
                />
              ))}
            </div>
          </div>

          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save({ staff_email: email.trim() || null }, "Staff email saved");
            }}
          >
            <Field label="Staff email" hint="Gets new-request and low-stock alerts" className="flex-1">
              <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!staff} placeholder="seeds@example.org" />
            </Field>
            <Button type="submit" disabled={!staff || busy} className="mb-[18px]">
              Save
            </Button>
          </form>

          <div className="rounded-xl bg-sage-50 p-3 text-xs text-muted">
            {state!.emailConfigured ? (
              <>
                <Badge tone="green">Email service connected</Badge> Messages are emailed and also kept in the log.
              </>
            ) : (
              <>
                <Badge tone="amber">No email service</Badge> Messages are only written to the log on the right. To send real emails, add{" "}
                <code>RESEND_API_KEY</code> and <code>NOTIFY_FROM_EMAIL</code> on the server.
              </>
            )}
          </div>
          <Button onClick={test} disabled={!staff || busy}>
            <Send size={15} /> Send a test notification
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Recent notifications" subtitle="Last 25 messages, newest first" />
        {log.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nothing sent yet">Turn notifications on, then approve or deliver an order.</EmptyState>
          </div>
        ) : (
          <ul className="max-h-[560px] divide-y divide-sage-100 overflow-y-auto">
            {log.map((n) => (
              <li key={n.id} className="px-5 py-3 text-sm">
                <details>
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-forest-900">{n.subject}</span>
                      <span className="block text-xs text-muted">
                        {fmtDate(n.created_at, true)} · to {n.recipient ?? "—"}
                        {n.order_id && orders.get(n.order_id) ? ` · #${orders.get(n.order_id)!.order_number}` : ""}
                      </span>
                    </span>
                    <Badge tone={STATUS_TONE[n.status]}>{STATUS_LABEL[n.status]}</Badge>
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-sage-50 p-3 font-sans text-xs text-ink">{n.body}</pre>
                  {n.error && <p className="mt-1 text-xs text-red-700">{n.error}</p>}
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
