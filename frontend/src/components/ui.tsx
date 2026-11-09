import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Minus,
  X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="6" fill="var(--ink)" />
      <rect x="6" y="6.5" width="12" height="2" rx="1" fill="var(--ink-contrast)" />
      <rect x="6" y="10.5" width="12" height="2" rx="1" fill="var(--ink-contrast)" />
      <rect x="6" y="14.5" width="12" height="2" rx="1" fill="var(--ink-contrast)" opacity=".55" />
    </svg>
  );
}

export function PageHeader({
  title,
  meta,
  actions,
  crumbs,
  badge,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  crumbs?: { label: string; to?: string }[];
  badge?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="titles">
        {crumbs && <Breadcrumbs items={crumbs} />}
        <div className="title-row">
          <h1>{title}</h1>
          {badge}
        </div>
        {meta && <p className="meta">{meta}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      {items.map((c, i) => (
        <Fragment key={c.label}>
          {i > 0 && <ChevronRight size={14} aria-hidden />}
          {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
        </Fragment>
      ))}
    </nav>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  title?: string;
}

/** A row of toggle buttons; exactly one is pressed. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  collapse = false,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  collapse?: boolean;
}) {
  return (
    <div
      className={`segmented ${size === "sm" ? "sm" : ""} ${collapse ? "icon-collapse" : ""}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          title={o.title}
          aria-label={collapse ? o.label : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          <span className="seg-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** A native <select> dressed as a toolbar pill: keeps keyboard + mobile pickers for free. */
export function FilterSelect<T extends string>({
  prefix,
  value,
  options,
  onChange,
  isDefault,
}: {
  prefix: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  isDefault?: boolean;
}) {
  const current = options.find((o) => o.value === value)?.label ?? "";
  return (
    <label className={`filter-pill ${isDefault === false ? "is-active" : ""}`}>
      <span className="filter-pill__prefix">{prefix}</span>
      <span className="filter-pill__value">{current}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={prefix}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden />
    </label>
  );
}

export function Chip({
  label,
  onRemove,
  removeLabel,
}: {
  label: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <span className="chip">
      {label}
      <button type="button" onClick={onRemove} aria-label={removeLabel}>
        <X size={12} aria-hidden />
      </button>
    </span>
  );
}

export interface DeltaValue {
  text: string;
  direction: "up" | "down" | "flat";
  good: boolean | null;
  vs?: string;
}

/** A change indicator: arrow icon + signed value + color, never color alone. */
export function Delta({ delta }: { delta: DeltaValue }) {
  const Icon =
    delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : Minus;
  const tone = delta.good === null ? "flat" : delta.good ? "good" : "bad";
  return (
    <span className={`delta ${tone}`}>
      <Icon size={14} aria-hidden />
      {delta.text}
      {delta.vs && <span className="vs">vs {delta.vs}</span>}
    </span>
  );
}

export function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div
      className="meter"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 1000) / 10}
      aria-label={label}
    >
      <span style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

export function KpiStrip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="card kpi-strip" aria-label={label} role="group">
      {children}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {children}
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function Skeleton({
  width = "100%",
  height = 16,
  style,
}: {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}) {
  return <span className="skeleton" style={{ width, height, ...style }} aria-hidden />;
}

export function StateBlock({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state-block">
      <span className="icon-circle">
        <Icon size={18} aria-hidden />
      </span>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

/** Copy text to the clipboard with a brief "Copied" confirmation announced to screen readers. */
export function CopyButton({
  text,
  label = "Copy",
  iconOnly = false,
  className = "btn btn-secondary",
}: {
  text: string;
  label?: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard;
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (permissions, insecure context); the text is still selectable.
    }
  }
  if (!canCopy) return null;
  const Icon = copied ? Check : Copy;
  return (
    <>
      <button
        type="button"
        className={`${className} ${iconOnly ? "btn-icon" : ""}`}
        onClick={copy}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
      >
        <Icon size={15} aria-hidden />
        {!iconOnly && (copied ? "Copied" : label)}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}
