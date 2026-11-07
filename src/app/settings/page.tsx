"use client";

import { useState } from "react";
import clsx from "clsx";
import { useData } from "@/components/data-provider";
import { Loading, PageHeader } from "@/components/ui";
import { NotificationsTab } from "@/components/settings/notifications-tab";
import { BundlesTab } from "@/components/settings/bundles-tab";
import { SystemTab } from "@/components/settings/system-tab";

const TABS = [
  { id: "notifications", label: "Notifications" },
  { id: "bundles", label: "Bundles & quantities" },
  { id: "system", label: "System" },
] as const;

export default function SettingsPage() {
  const { state } = useData();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("notifications");
  if (!state) return <Loading />;
  return (
    <>
      <PageHeader title="Settings" />
      <div className="mb-6 flex gap-1 border-b border-sage-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium",
              tab === t.id ? "border-forest-600 text-forest-900" : "border-transparent text-muted hover:text-forest-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "notifications" && <NotificationsTab key={state.snapshot.settings.notifications.staff_email ?? ""} />}
      {tab === "bundles" && <BundlesTab />}
      {tab === "system" && <SystemTab />}
    </>
  );
}
