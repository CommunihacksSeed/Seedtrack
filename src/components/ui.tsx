"use client";

import Link from "next/link";
import { AlertCircle, CircleDashed, MoreHorizontal, RotateCw, X } from "lucide-react";
import clsx from "clsx";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { OrderStatus, StockStatus } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Design tokens in one place. Pages use these components rather than
 * repeating raw class strings, so spacing, radii and heights stay even.
 *   radius: 6px controls, 8px containers · borders: sage-200
 *   heights: 36px (md) / 32px (sm) controls · icons: 16px (14px in sm)
 * ------------------------------------------------------------------ */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight text-forest-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("rounded-lg border border-sage-200 bg-white", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action, subtitle }: { title: string; action?: React.ReactNode; subtitle?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-sage-100 px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-forest-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Section heading used between blocks on a page. */
export function SectionTitle({ children, count, action }: { children: React.ReactNode; count?: number; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-forest-900">
        {children}
        {count !== undefined && <span className="rounded bg-sage-100 px-1.5 text-xs font-medium tabular-nums text-muted">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
type BtnSize = "sm" | "md";
export function buttonCls(variant: BtnVariant = "secondary", size: BtnSize = "md", className?: string) {
  return clsx(
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-8 px-2.5 text-[13px] [&_svg]:size-3.5" : "h-9 px-3.5 text-sm [&_svg]:size-4",
    variant === "primary" && "bg-forest-600 text-white hover:bg-forest-700",
    variant === "secondary" && "border border-sage-200 bg-white text-forest-900 hover:border-sage-300 hover:bg-sage-50",
    variant === "ghost" && "text-forest-800 hover:bg-sage-100",
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
  return <button type="button" className={buttonCls(variant, size, className)} {...rest} />;
}

/** A link styled as a button. Renders a disabled button when disabled. */
export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  disabled,
  className,
  children,
}: {
  href: string;
  variant?: BtnVariant;
  size?: BtnSize;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (disabled)
    return (
      <Button variant={variant} size={size} disabled className={className}>
        {children}
      </Button>
    );
  return (
    <Link href={href} className={buttonCls(variant, size, className)}>
      {children}
    </Link>
  );
}

type Tone = "gray" | "green" | "amber" | "red" | "blue" | "violet" | "teal" | "slate";
const TONES: Record<Tone, string> = {
  gray: "bg-stone-100 text-stone-700",
  green: "bg-forest-50 text-forest-800",
  amber: "bg-amber-50 text-amber-900",
  red: "bg-red-50 text-red-800",
  blue: "bg-sky-50 text-sky-800",
  violet: "bg-violet-50 text-violet-800",
  teal: "bg-teal-50 text-teal-800",
  slate: "bg-slate-100 text-slate-600",
};
const DOTS: Record<Tone, string> = {
  gray: "bg-stone-400",
  green: "bg-forest-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-sky-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
  slate: "bg-slate-400",
};

/** Light status tag. The text always carries the meaning; color only reinforces it. */
export function Badge({ tone = "gray", dot, children, className }: { tone?: Tone; dot?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium", TONES[tone], className)}>
      {dot && <span className={clsx("size-1.5 shrink-0 rounded-full", DOTS[tone])} aria-hidden />}
      {children}
    </span>
  );
}

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
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {status}
    </Badge>
  );
}

const STOCK_TONE: Record<StockStatus, Tone> = {
  "Needs Stock Count": "amber",
  Available: "green",
  "Low Stock": "amber",
  "Out of Stock": "red",
};
export function StockBadge({ status }: { status: StockStatus }) {
  if (status === "Needs Stock Count")
    return (
      <Badge tone="amber">
        <CircleDashed size={12} aria-hidden /> Needs count
      </Badge>
    );
  return (
    <Badge tone={STOCK_TONE[status]} dot>
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
  "h-9 w-full rounded-md border border-sage-200 bg-white px-3 text-sm text-ink placeholder:text-stone-400 focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100 disabled:bg-sage-50 [&:is(textarea)]:h-auto [&:is(textarea)]:py-2";

/** Native dialog: focus is trapped, Escape and the backdrop close it. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useDialog(open);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={clsx(
        "m-auto w-[calc(100%-2rem)] animate-fade-in rounded-lg border border-sage-200 bg-white p-0 text-ink shadow-xl",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open && (
        <div>
          <div className="flex items-center justify-between gap-3 border-b border-sage-100 px-5 py-3.5">
            <h2 id={titleId} className="font-display text-xl font-semibold text-forest-900">{title}</h2>
            <IconButton label="Close" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
          <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/**
 * Record detail panel. Slides in from the right on wider screens and fills the
 * screen on phones. Uses <dialog> for focus handling and Escape to close.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useDialog(open);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-full bg-transparent p-0 text-ink sm:max-w-md"
    >
      {open && (
        <div className="flex h-full animate-slide-in flex-col border-l border-sage-200 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-sage-100 px-5 py-4">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-semibold leading-snug text-forest-900">{title}</h2>
              {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
            </div>
            <IconButton label="Close details" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-sage-100 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return ref;
}

export function IconButton({ label, children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx("grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-sage-100 hover:text-forest-900", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export type MenuItem = { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean };

/**
 * "More actions" menu. Opens below its button with fixed positioning so table
 * containers with overflow don't clip it. Arrow keys move, Escape closes and
 * returns focus, clicking outside closes.
 */
export function ActionMenu({ label, items, size = "sm" }: { label: string; items: MenuItem[]; size?: BtnSize }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback((focusButton = true) => {
    setOpen(false);
    setPos(null);
    if (focusButton) btn.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const height = items.length * 36 + 8;
    const below = r.bottom + 4 + height < window.innerHeight;
    setPos({ top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - height), right: Math.max(8, window.innerWidth - r.right) });
  }, [open, items.length]);

  // Focus the first item once the menu is on screen.
  useEffect(() => {
    if (open && pos) menu.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(false);
    };
    const onScroll = () => close(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close]);

  function onKey(e: React.KeyboardEvent) {
    const all = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      all[(i + 1) % all.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      all[(i - 1 + all.length) % all.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      all[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      all[all.length - 1]?.focus();
    } else if (e.key === "Tab") close(false);
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={clsx(
          "grid shrink-0 place-items-center rounded-md border border-sage-200 bg-white text-forest-800 hover:bg-sage-50",
          size === "sm" ? "size-8" : "size-9",
        )}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && pos && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onKey}
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-50 min-w-44 animate-fade-in rounded-md border border-sage-200 bg-white p-1 shadow-lg"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                close(false);
                it.onSelect();
              }}
              className={clsx(
                "flex h-9 w-full items-center gap-2 rounded px-2.5 text-left text-sm outline-none focus:bg-sage-100 disabled:opacity-50 [&_svg]:size-4",
                it.danger ? "text-red-700" : "text-forest-900",
              )}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Segmented view switcher (tabs). Left/Right arrows move between tabs.
 * Counts are shown as text, not only as color.
 */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number; icon?: React.ReactNode; attention?: boolean }[];
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  }
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className={clsx("inline-flex max-w-full gap-0.5 overflow-x-auto rounded-md border border-sage-200 bg-sage-50 p-0.5 [scrollbar-width:none]", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={clsx(
              "flex h-8 shrink-0 items-center gap-1.5 rounded px-3 text-sm font-medium transition-colors [&_svg]:size-4",
              active ? "bg-white text-forest-900 shadow-[0_0_0_1px_var(--color-sage-200)]" : "text-muted hover:text-forest-900",
            )}
          >
            {o.icon}
            {o.label}
            {o.count !== undefined && (
              <span
                className={clsx(
                  "min-w-5 rounded px-1 text-center text-xs tabular-nums",
                  o.attention && o.count > 0 ? "bg-amber-100 text-amber-900" : active ? "bg-forest-50 text-forest-800" : "text-muted",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Row of search + filters + view controls that sits above a list or table. */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("no-print mb-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center", className)}>{children}</div>;
}

export function SearchInput({ value, onChange, placeholder, label, className }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <div className={clsx("relative", className)}>
      <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 fill-none stroke-current stroke-2 text-muted">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input type="search" className={clsx(inputCls, "pl-9")} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
    </div>
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
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && <span className={clsx(tone === "default" ? "text-forest-500" : tone === "warn" ? "text-amber-600" : "text-red-600")}>{icon}</span>}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-forest-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

/** Compact figure for a stats strip: label, value, one-line hint. */
export function Stat({ label, value, hint, emphasis }: { label: string; value: React.ReactNode; hint?: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="truncate text-xs font-medium text-muted">{label}</dt>
      <dd className={clsx("mt-0.5 font-semibold tabular-nums text-forest-900", emphasis ? "text-2xl" : "text-xl")}>{value}</dd>
      {hint && <dd className="mt-0.5 truncate text-xs text-muted">{hint}</dd>}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon,
  compact,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={clsx("rounded-lg border border-dashed border-sage-300 bg-white/60 text-center", compact ? "px-4 py-6" : "px-6 py-10")}>
      {icon && <div className="mx-auto mb-2 grid size-9 place-items-center rounded-md bg-sage-100 text-forest-600 [&_svg]:size-5">{icon}</div>}
      <p className="font-medium text-forest-900">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Couldn’t load SeedFlow", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50/60 px-6 py-8 text-center">
      <AlertCircle size={20} className="mx-auto mb-2 text-red-600" aria-hidden />
      <p className="font-medium text-red-900">{title}</p>
      {message && <p className="mt-1 text-sm text-red-800">{message}</p>}
      {onRetry && (
        <Button className="mt-4" onClick={onRetry}>
          <RotateCw /> Try again
        </Button>
      )}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label={label} role="status">
      <div className="h-8 w-56 rounded-md bg-sage-200" />
      <div className="h-24 rounded-lg bg-white" />
      <div className="space-y-px overflow-hidden rounded-lg border border-sage-200 bg-sage-100">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-11 bg-white" />
        ))}
      </div>
    </div>
  );
}

/** True when the system asks for reduced motion; used for JS-driven chart animations. */
export function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

export const fmtNum = (n: number) => n.toLocaleString("en-US");

/** A quantity that may be unknown. Unknown (null) is never shown as 0. */
export function Qty({ value, unknownLabel = "Not counted" }: { value: number | null; unknownLabel?: string }) {
  if (value === null)
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-amber-800">
        <CircleDashed size={12} aria-hidden />
        {unknownLabel}
      </span>
    );
  return <span className="tabular-nums">{fmtNum(value)}</span>;
}

/** Shared table look. Wrap in a Card with overflow-x-auto so wide tables scroll inside it. */
export const tableCls = {
  table: "w-full text-sm",
  thead: "border-b border-sage-200 bg-sage-50 text-left text-xs font-medium text-muted",
  th: "h-9 px-3 font-medium first:pl-4 last:pr-4",
  thNum: "h-9 px-3 text-right font-medium",
  tr: "border-b border-sage-100 last:border-0",
  td: "h-12 px-3 first:pl-4 last:pr-4",
  tdNum: "h-12 px-3 text-right tabular-nums",
};

export function fmtDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
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

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={clsx("flex items-start justify-between gap-4", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
      <span>
        <span className="block text-sm font-medium text-forest-900">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx("relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-forest-600" : "bg-stone-300")}
      >
        <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
      </button>
    </label>
  );
}
