"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Trash2, UserPlus, Users } from "lucide-react";
import { useData } from "@/components/data-provider";
import { Badge, Button, Card, CardHeader, Field, fmtDate, inputCls } from "@/components/ui";

type StaffUser = { id: string; email: string; name: string | null; created_at: string; last_login_at: string | null };

/** Staff accounts: only people listed here can sign in to the staff panel. */
export function StaffTab() {
  const { toast } = useData();
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [me, setMe] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/staff", { cache: "no-store" });
    if (res.status === 401) return window.location.replace("/login?next=/settings");
    const data = await res.json();
    setUsers(data.users);
    setMe(data.me);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [load]);

  async function call(url: string, body?: unknown, method = "POST") {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
    return data;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Staff accounts" subtitle="Only these people can sign in and see requests, emails and addresses." action={<Users size={18} className="text-forest-500" />} />
        <ul className="divide-y divide-sage-100">
          {users === null ? (
            <li className="px-5 py-4 text-sm text-muted">Loading…</li>
          ) : (
            users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-forest-900">
                    {u.name || u.email} {u.id === me && <Badge tone="green">You</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {u.email} · {u.last_login_at ? `last signed in ${fmtDate(u.last_login_at, true)}` : "never signed in"}
                  </p>
                </div>
                {u.id !== me && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${u.email}`}
                    onClick={async () => {
                      if (!confirm(`Remove ${u.email}? They will be signed out and can no longer sign in.`)) return;
                      try {
                        await call(`/api/staff/${u.id}`, undefined, "DELETE");
                        toast(`Removed ${u.email}.`);
                        load();
                      } catch (e) {
                        toast((e as Error).message, "error");
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </Button>
                )}
              </li>
            ))
          )}
        </ul>
      </Card>

      <div className="space-y-5">
        <AddStaff onAdded={load} call={call} />
        <ChangePassword call={call} />
      </div>
    </div>
  );
}

function AddStaff({ onAdded, call }: { onAdded: () => void; call: (u: string, b?: unknown) => Promise<unknown> }) {
  const { toast } = useData();
  const [f, setF] = useState({ email: "", name: "", password: "" });
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader title="Add a staff member" subtitle="Share the starting password with them privately; they can change it after signing in." action={<UserPlus size={18} className="text-forest-500" />} />
      <form
        className="grid gap-4 p-5 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await call("/api/staff", { email: f.email, name: f.name || undefined, password: f.password });
            toast(`${f.email} can now sign in.`);
            setF({ email: "", name: "", password: "" });
            onAdded();
          } catch (err) {
            toast((err as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Email">
          <input className={inputCls} type="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        </Field>
        <Field label="Name" hint="Optional">
          <input className={inputCls} autoComplete="off" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Starting password" hint="At least 10 characters" className="sm:col-span-2">
          <input className={inputCls} type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" disabled={busy || !f.email || !f.password}>
            Add staff member
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ChangePassword({ call }: { call: (u: string, b?: unknown) => Promise<unknown> }) {
  const { toast } = useData();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const mismatch = f.confirm && f.next !== f.confirm;
  return (
    <Card>
      <CardHeader title="Change your password" subtitle="Signs you out on your other devices." action={<KeyRound size={18} className="text-forest-500" />} />
      <form
        className="grid gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (mismatch) return;
          setBusy(true);
          try {
            await call("/api/auth/password", { current: f.current, next: f.next });
            toast("Password changed.");
            setF({ current: "", next: "", confirm: "" });
          } catch (err) {
            toast((err as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Current password">
          <input className={inputCls} type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required />
        </Field>
        <Field label="New password" hint="At least 10 characters">
          <input className={inputCls} type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required />
        </Field>
        <Field label="Confirm new password" error={mismatch ? "Passwords don’t match" : undefined}>
          <input className={inputCls} type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required />
        </Field>
        <div>
          <Button type="submit" disabled={busy || !f.current || !f.next || Boolean(mismatch)}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}
