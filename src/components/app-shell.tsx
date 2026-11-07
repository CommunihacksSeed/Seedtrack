"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { BarChart3, ClipboardList, LayoutDashboard, Menu, Package, Settings, Sprout, Truck, Warehouse, X } from "lucide-react";
import { useData } from "./data-provider";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Seed Inventory", icon: Warehouse },
  { href: "/requests", label: "Seed Requests", icon: ClipboardList },
  { href: "/packing", label: "Packing Queue", icon: Package },
  { href: "/deliveries", label: "Deliveries", icon: Truck },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-forest-600 text-white shadow-sm">
        <Sprout size={20} strokeWidth={2.2} />
      </span>
      <span>
        <span className="block font-display text-xl font-semibold leading-none text-forest-900">SeedFlow</span>
        <span className="mt-0.5 block text-[11px] leading-none text-muted">Seed requests → community growth</span>
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { state } = useData();
  const awaiting = state?.snapshot.orders.filter((o) => o.status === "Received" || o.status === "Under Review").length ?? 0;
  const packing = state?.snapshot.orders.filter((o) => ["Approved", "Preparing"].includes(o.status)).length ?? 0;
  const ready = state?.snapshot.orders.filter((o) => o.status === "Ready").length ?? 0;
  return (
    <nav className="space-y-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        const count = href === "/requests" ? awaiting : href === "/packing" ? packing : href === "/deliveries" ? ready : 0;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-forest-600 text-white shadow-sm" : "text-forest-800 hover:bg-forest-50",
            )}
          >
            <Icon size={18} />
            <span className="flex-1">{label}</span>
            {count > 0 && (
              <span className={clsx("rounded-full px-2 text-xs tabular-nums", active ? "bg-white/20" : "bg-forest-100 text-forest-800")}>
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Footer() {
  return (
    <p className="text-[11px] leading-relaxed text-muted">
      Built for Youth in Food Systems — CommuniHacks 2026.
      <br />
      Hackathon prototype; not an official YFS service.
    </p>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { state } = useData();
  return (
    <div className="min-h-screen lg:flex">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-sage-200 bg-cream px-4 py-5 lg:flex">
        <div className="space-y-8">
          <Logo />
          <NavLinks />
        </div>
        <Footer />
      </aside>

      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-sage-200 bg-cream/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <button className="rounded-lg p-2 text-forest-800 hover:bg-forest-50" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
      </header>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-forest-900/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col justify-between bg-cream px-4 py-5 shadow-xl">
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <Logo />
                <button className="rounded-lg p-2 hover:bg-forest-50" onClick={() => setOpen(false)} aria-label="Close menu">
                  <X size={20} />
                </button>
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <Footer />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1">
        {state?.demo && (
          <div className="no-print border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900 lg:px-8">
            Demo Mode — Sample Inventory Data. All quantities, schools and contacts are fictional. Data is stored in a local demo file, not a database.
          </div>
        )}
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
