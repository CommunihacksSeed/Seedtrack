"use client";

import Link from "next/link";
import { X } from "lucide-react";
import clsx from "clsx";
import { useEffect, useRef } from "react";
import type { OrderStatus, StockStatus } from "@/lib/types";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-forest-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("rounded-2xl border border-sage-200 bg-white shadow-[0_1px_2px_rgba(31,42,34,0.04)]", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action, subtitle }: { title: string; action?: React.ReactNode; subtitle?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-sage-100 px-5 py-4">
      <div>
        <h2 className="font-semibold text-forest-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
type BtnSize = "sm" | "md";
export function buttonCls(variant: BtnVariant = "secondary", size: BtnSize = "md", className?: string) {
  return clsx(
    "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
    variant === "primary" && "bg-forest-600 text-white shadow-sm hover:bg-forest-700",
    variant === "secondary" && "border border-sage-200 bg-white text-forest-800 hover:bg-sage-50",
    variant === "ghost" && "text-forest-700 hover:bg-forest-50",
    variant === "danger" && "border border-red-200 bg-white text-red-700 hover:bg-red-50",
    className,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }) {
  return <button className={buttonCls(variant, size, className)} {...rest} />;
}

/** A link styled as a button. Renders a disabled button when disabled. */
export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  disabled,
  children,
}: {
  href: string;
  variant?: BtnVariant;
  size?: BtnSize;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  if (disabled)
    return (
      <Button variant={variant} size={size} disabled>
        {children}
      </Button>
    );
  return (
    <Link href={href} className={buttonCls(variant, size)}>
      {children}
    </Link>
  );
}

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

type Tone = "gray" | "green" | "amber" | "red" | "blue" | "violet" | "teal" | "slate";
const TONES: Record<Tone, string> = {
  gray: "bg-stone-50 text-stone-700 ring-stone-200",
  green: "bg-forest-50 text-forest-800 ring-forest-200",
  amber: "bg-amber-50 text-amber-900 ring-amber-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
  teal: "bg-teal-50 text-teal-800 ring-teal-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
};

export const STATUS_TONE: Record<OrderStatus, Tone> = {
  Received: "blue",
  "Under Review": "violet",
  Approved: "teal",
  Preparing: "amber",
  Ready: "green",
  Delivered: "gray",
  Cancelled: "slate",
};
export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

const STOCK_TONE: Record<StockStatus, Tone> = {
  "Needs Stock Count": "amber",
  Available: "green",
  "Low Stock": "amber",
  "Out of Stock": "red",
};
export function StockBadge({ status }: { status: StockStatus }) {
  return (
    <Badge tone={STOCK_TONE[status]} className={status === "Needs Stock Count" ? "border border-dashed border-amber-300 ring-0" : undefined}>
      {status}
    </Badge>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={clsx("block text-sm", className)}>
      <span className="mb-1 block font-medium text-forest-900">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm text-ink placeholder:text-stone-400 focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100 disabled:bg-sage-50";

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={clsx(
        "m-auto w-[calc(100%-2rem)] rounded-2xl border border-sage-200 bg-white p-0 text-ink shadow-2xl backdrop:bg-forest-900/30 backdrop:backdrop-blur-[2px]",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open && (
        <div>
          <div className="flex items-center justify-between border-b border-sage-100 px-5 py-4">
            <h2 className="font-display text-xl font-semibold text-forest-900">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-sage-100" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "warn" | "alert";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {icon && (
          <span
            className={clsx(
              "rounded-lg p-1.5",
              tone === "default" && "bg-forest-50 text-forest-600",
              tone === "warn" && "bg-amber-50 text-amber-700",
              tone === "alert" && "bg-red-50 text-red-700",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-forest-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-sage-200 bg-sage-50/50 px-6 py-10 text-center">
      <p className="font-medium text-forest-900">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-56 rounded-xl bg-sage-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-white" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-white" />
    </div>
  );
}

export function Qty({ value, unknownLabel = "Not counted" }: { value: number | null; unknownLabel?: string }) {
  if (value === null) return <span className="italic text-amber-700">{unknownLabel}</span>;
  return <span className="tabular-nums">{value}</span>;
}

export function fmtDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d}d ago`;
}
