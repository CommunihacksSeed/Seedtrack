"use client";

import { useState } from "react";
import { useData } from "@/components/data-provider";
import { Loading, PageHeader, SegmentedTabs } from "@/components/ui";
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
      <PageHeader title="Settings" subtitle="Notifications, seed bundles and system details." />
      <SegmentedTabs className="mb-5" label="Settings sections" value={tab} onChange={setTab} options={TABS.map((t) => ({ value: t.id, label: t.label }))} />
      {tab === "notifications" && <NotificationsTab key={state.snapshot.settings.notifications.staff_email ?? ""} />}
      {tab === "bundles" && <BundlesTab />}
      {tab === "system" && <SystemTab />}
    </>
  );
}
