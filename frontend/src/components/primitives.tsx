import { useLayoutEffect, useState, type ReactNode } from "react";
import type { RiskBand } from "../api";

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
  rows: [string, string][];
}

export function Tooltip({ tip }: { tip: TooltipState | null }) {
  if (!tip) return null;
  return (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }} role="status">
      <div className="t-title">{tip.title}</div>
      {tip.rows.map(([k, v]) => (
        <div className="t-row" key={k}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

/** Card with an optional chart/table toggle: every chart has a table-view twin. */
export function ChartCard({
  title,
  subtitle,
  chart,
  table,
  className = "",
}: {
  title: string;
  subtitle?: string;
  chart: ReactNode;
  table?: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`card ${className}`} aria-label={title}>
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {table && (
          <button
            className="btn ghost"
            onClick={() => setShowTable((s) => !s)}
            aria-pressed={showTable}
          >
            {showTable ? "Show chart" : "Show table"}
          </button>
        )}
      </div>
      {showTable ? <div className="table-wrap">{table}</div> : chart}
    </section>
  );
}

const RISK_LABEL: Record<RiskBand, string> = {
  high: "High risk",
  medium: "Watch",
  low: "Likely to renew",
};

export function RiskBadge({ band }: { band: RiskBand }) {
  return (
    <span className={`risk ${band}`}>
      <span className="icon" aria-hidden />
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
