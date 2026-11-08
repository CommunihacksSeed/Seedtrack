"use client";

import { useState } from "react";
import { useData } from "@/components/data-provider";
import { Loading, PageHeader, SegmentedTabs } from "@/components/ui";
import { NotificationsTab } from "@/components/settings/notifications-tab";
import { BundlesTab } from "@/components/settings/bundles-tab";
import { SystemTab } from "@/components/settings/system-tab";
import { StaffTab } from "@/components/settings/staff-tab";

const TABS = [
  { id: "notifications", label: "Notifications" },
  { id: "bundles", label: "Bundles & quantities" },
  { id: "staff", label: "Staff accounts" },
  { id: "system", label: "System" },
] as const;

export default function SettingsPage() {
  const { state } = useData();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("notifications");
  if (!state) return <Loading />;
  return (
    <>
      <PageHeader title="Settings" subtitle="Notifications, seed bundles, staff accounts and system details." />
      <SegmentedTabs className="mb-5" label="Settings sections" value={tab} onChange={setTab} options={TABS.map((t) => ({ value: t.id, label: t.label }))} />
      {tab === "notifications" && <NotificationsTab key={state.snapshot.settings.notifications.staff_email ?? ""} />}
      {tab === "bundles" && <BundlesTab />}
      {tab === "staff" && <StaffTab />}
      {tab === "system" && <SystemTab />}
    </>
  );
}
