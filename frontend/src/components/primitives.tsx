import { BarChart3, Table2 } from "lucide-react";
import { useLayoutEffect, useState, type ReactNode } from "react";
import type { RiskBand } from "../api";
import { SegmentedControl, Skeleton } from "./ui";

/**
 * Track an element's width so charts re-layout responsively instead of scaling text.
 *
 * Uses a callback ref (not useRef) so measurement starts whenever the element actually mounts,
 * even if the component first rendered without it (e.g. while data was loading). Zero widths are
 * ignored: they occur transiently while a subtree is hidden (Suspense, display:none) and would
 * otherwise collapse the chart to nothing.
 */
export function useWidth<T extends HTMLElement>(fallback = 600) {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = (w: number) => w > 0 && setWidth(Math.floor(w));
    measure(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

export interface TooltipState {
  x: number;
  y: number;
  title: string;
  /** [label, value, optional key color]. The value leads; the key mirrors the mark. */
  rows: [string, string, string?][];
  /** Container width, so tooltips near an edge anchor inward instead of clipping. */
  bounds?: number;
}

const EDGE = 96;

export function Tooltip({ tip }: { tip: TooltipState | null }) {
  if (!tip) return null;
  const anchor =
    tip.x < EDGE ? "anchor-left" : tip.bounds && tip.x > tip.bounds - EDGE ? "anchor-right" : "";
  return (
    <div className={`tooltip ${anchor}`} style={{ left: tip.x, top: tip.y }} role="status">
      <div className="t-title">{tip.title}</div>
      {tip.rows.map(([k, v, color]) => (
        <div className="t-row" key={k}>
          {color && <span className="t-key" style={{ background: color }} aria-hidden />}
          <span className="t-label">{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

type View = "chart" | "table";

/** Card with an optional chart/table toggle: every chart has a table-view twin. */
export function ChartCard({
  title,
  subtitle,
  chart,
  table,
  actions,
  footer,
  loading = false,
  stale = false,
  skeletonHeight = 240,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  chart: ReactNode;
  table?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
  stale?: boolean;
  skeletonHeight?: number;
  className?: string;
}) {
  const [view, setView] = useState<View>("chart");
  return (
    <section
      className={`card ${stale ? "is-stale" : ""} ${className}`}
      aria-label={title}
      aria-busy={loading || stale || undefined}
    >
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="sub">{subtitle}</p>}
        </div>
        <div className="card-actions">
          {actions}
          {table && (
            <SegmentedControl<View>
              size="sm"
              collapse
              ariaLabel={`${title} view`}
              value={view}
              onChange={setView}
              options={[
                { value: "chart", label: "Chart", icon: <BarChart3 size={14} aria-hidden /> },
                { value: "table", label: "Table", icon: <Table2 size={14} aria-hidden /> },
              ]}
            />
          )}
        </div>
      </div>
      <div className="card-body">
        {loading ? (
          <>
            <Skeleton height={skeletonHeight} />
            <span className="sr-only">Loading {title}</span>
          </>
        ) : view === "table" && table ? (
          <div className="table-wrap">{table}</div>
        ) : (
          chart
        )}
      </div>
      {footer && !loading && <div className="card-foot">{footer}</div>}
    </section>
  );
}

const RISK_LABEL: Record<RiskBand, string> = {
  high: "High risk",
  medium: "Watch",
  low: "Likely to renew",
};

/** The status shape (triangle / circle / square) that always travels with the status color. */
export function RiskShape({ band }: { band: RiskBand }) {
  return <span className={`risk-shape ${band}`} aria-hidden />;
}

export function RiskBadge({ band }: { band: RiskBand }) {
  return (
    <span className={`risk ${band}`}>
      <RiskShape band={band} />
      {RISK_LABEL[band]}
    </span>
  );
}

export const RISK_COLOR: Record<RiskBand, string> = {
  high: "var(--status-critical)",
  medium: "var(--status-warning)",
  low: "var(--status-good)",
};
export { RISK_LABEL };
