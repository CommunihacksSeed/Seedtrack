"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ClipboardList, LayoutDashboard, Menu, Package, Settings, Sprout, Warehouse, X } from "lucide-react";
import { useData } from "./data-provider";
import { isPublicPath } from "./public-path";
import { ErrorState } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Seed Inventory", icon: Warehouse },
  { href: "/requests", label: "Seed Requests", icon: ClipboardList },
  { href: "/packing", label: "Packing Queue", icon: Package },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md">
      <span className="grid size-8 place-items-center rounded-md bg-forest-600 text-white">
        <Sprout size={18} strokeWidth={2.2} />
      </span>
      <span className="font-display text-xl font-semibold leading-none text-forest-900">SeedFlow</span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { state } = useData();
  const orders = state?.snapshot.orders ?? [];
  const counts: Record<string, { n: number; label: string }> = {
    "/requests": { n: orders.filter((o) => o.status === "Received" || o.status === "Under Review").length, label: "to review" },
    "/packing": { n: orders.filter((o) => o.status === "Approved" || o.status === "Preparing").length, label: "to pack" },
  };
  return (
    <nav aria-label="Main" className="space-y-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        const c = counts[href];
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
              active ? "bg-forest-600/10 font-semibold text-forest-900" : "font-medium text-forest-800/90 hover:bg-sage-100 hover:text-forest-900",
            )}
          >
            {active && <span aria-hidden className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-forest-600" />}
            <Icon size={17} className={active ? "text-forest-600" : "text-muted"} />
            <span className="flex-1 truncate">{label}</span>
            {c && c.n > 0 && (
              <span className="rounded bg-sage-200/70 px-1.5 text-xs font-medium tabular-nums text-forest-900" aria-label={`${c.n} ${c.label}`}>
                {c.n}
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
  const { state, error, refresh } = useData();
  const path = usePathname();
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Public request form: no sidebar, no staff banners, just the page.
  if (isPublicPath(path)) return <main id="main">{children}</main>;

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only z-50 rounded-md bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-sage-200 bg-sage-50 px-3 py-4 lg:flex">
        <div className="space-y-6">
          <div className="px-1.5">
            <Logo />
          </div>
          <NavLinks />
        </div>
        <div className="px-1.5">
          <Footer />
        </div>
      </aside>

      <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-sage-200 bg-cream/95 px-4 backdrop-blur lg:hidden">
        <Logo />
        <button className="grid size-9 place-items-center rounded-md text-forest-800 hover:bg-sage-100" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
          <Menu size={20} />
        </button>
      </header>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 animate-fade-in bg-forest-900/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col justify-between bg-sage-50 px-3 py-4 shadow-xl">
            <div className="space-y-6">
              <div className="flex items-center justify-between px-1.5">
                <Logo />
                <button ref={closeBtn} className="grid size-9 place-items-center rounded-md hover:bg-sage-100" onClick={() => setOpen(false)} aria-label="Close menu">
                  <X size={20} />
                </button>
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <div className="px-1.5">
              <Footer />
            </div>
          </div>
        </div>
      )}

      <main id="main" className="min-w-0 flex-1">
        <div className={clsx("mx-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-7", path.startsWith("/requests") ? "max-w-[1400px]" : "max-w-7xl")}>
          {error && !state ? <ErrorState message={error} onRetry={refresh} /> : children}
        </div>
      </main>
    </div>
  );
}
