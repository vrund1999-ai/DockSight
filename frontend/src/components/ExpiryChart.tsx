import { max, scaleBand, scaleLinear } from "d3";
import { useState } from "react";
import type { ExpiryBucket, RiskBand } from "../api";
import { fmt } from "../format";
import {
  RISK_COLOR,
  RISK_LABEL,
  RiskShape,
  Tooltip,
  useWidth,
  type TooltipState,
} from "./primitives";
import { columnPath } from "./shapes";

// Bottom -> top. High risk sits on the baseline so it's the easiest to compare across quarters.
const BANDS: RiskBand[] = ["high", "medium", "low"];
const M = { top: 20, right: 8, bottom: 24, left: 44 };
const GAP = 2; // Surface gap between stacked segments.
const MAX_BAR = 24; // Thin marks: columns never get wider than this, however wide the card.

const quarterLabel = (q: string) => `${q.slice(5)} '${q.slice(2, 4)}`;

/** The "expiry wall": square feet rolling per quarter, stacked by renewal-risk band. */
export function ExpiryChart({ data, height = 240 }: { data: ExpiryBucket[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(600);
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const x = scaleBand()
    .domain(data.map((d) => d.quarter))
    .range([M.left, width - M.right])
    .paddingInner(0.3)
    .paddingOuter(0.1);
  const total = (d: ExpiryBucket) => d.high + d.medium + d.low;
  const y = scaleLinear()
    .domain([0, max(data, total) || 1])
    .nice(4)
    .range([height - M.bottom, M.top]);
  const bw = Math.min(x.bandwidth(), MAX_BAR);
  const labelEvery = x.step() < 40 ? 2 : 1;
  const peak = data.reduce<ExpiryBucket | undefined>(
    (a, d) => (!a || total(d) > total(a) ? d : a),
    undefined,
  );

  return (
    <div
      className="chart"
      ref={ref}
      onPointerLeave={() => {
        setTip(null);
        setActive(null);
      }}
    >
      <div className="legend" aria-hidden>
        {[...BANDS].reverse().map((b) => (
          <span key={b}>
            <RiskShape band={b} />
            {RISK_LABEL[b]}
          </span>
        ))}
      </div>
      <div style={{ position: "relative" }}>
        <svg width={width} height={height} role="img" aria-label="Square feet expiring per quarter">
          <g className="grid">
            {y.ticks(4).map((t) => (
              <g key={t}>
                <line
                  x1={M.left}
                  x2={width - M.right}
                  y1={Math.round(y(t)) + 0.5}
                  y2={Math.round(y(t)) + 0.5}
                />
                <text x={M.left - 8} y={y(t) + 4} textAnchor="end">
                  {fmt.sqft(t).replace(" SF", "")}
                </text>
              </g>
            ))}
          </g>
          {data.map((d, i) => {
            const step = x.step();
            const bx = x(d.quarter)! + (x.bandwidth() - bw) / 2;
            const isActive = active === d.quarter;
            let acc = 0;
            const segments = BANDS.filter((b) => d[b] > 0);
            return (
              <g key={d.quarter} className={active && !isActive ? "dimmed" : ""}>
                {isActive && (
                  <rect
                    className="hover-band"
                    x={x(d.quarter)! - (step - x.bandwidth()) / 2}
                    y={M.top}
                    width={step}
                    height={height - M.top - M.bottom}
                    rx={6}
                  />
                )}
                {segments.map((b, j) => {
                  const y0 = y(acc);
                  acc += d[b];
                  const y1 = y(acc);
                  const isTop = j === segments.length - 1;
                  // Leave a surface gap above every segment except the topmost.
                  const h = Math.max(0, y0 - y1 - (isTop ? 0 : GAP));
                  return isTop ? (
                    <path
                      key={b}
                      className="mark"
                      d={columnPath(bx, y1, bw, h)}
                      fill={RISK_COLOR[b]}
                    />
                  ) : (
                    <rect
                      key={b}
                      className="mark"
                      x={bx}
                      y={y1 + GAP}
                      width={bw}
                      height={h}
                      fill={RISK_COLOR[b]}
                    />
                  );
                })}
                {/* Direct label only on the peak quarter: selective, not one per column. */}
                {peak === d && (
                  <text
                    x={bx + bw / 2}
                    y={y(total(d)) - 6}
                    textAnchor="middle"
                    className="label-secondary"
                  >
                    {fmt.sqft(total(d)).replace(" SF", "")}
                  </text>
                )}
                {i % labelEvery === 0 && (
                  <text x={bx + bw / 2} y={height - 6} textAnchor="middle">
                    {quarterLabel(d.quarter)}
                  </text>
                )}
                {/* Hit target spans the whole column, not just the painted bar. */}
                <rect
                  className="hit"
                  x={x(d.quarter)! - (step - x.bandwidth()) / 2}
                  y={M.top}
                  width={step}
                  height={height - M.top - M.bottom}
                  tabIndex={0}
                  aria-label={`${d.quarter}: ${fmt.sqft(total(d))} expiring, ${fmt.sqft(d.high)} high risk`}
                  onPointerEnter={() => show(d)}
                  onFocus={() => show(d)}
                  onBlur={() => {
                    setTip(null);
                    setActive(null);
                  }}
                />
              </g>
            );
          })}
          <line
            className="baseline"
            x1={M.left}
            x2={width - M.right}
            y1={Math.round(height - M.bottom) + 0.5}
            y2={Math.round(height - M.bottom) + 0.5}
          />
        </svg>
        <Tooltip tip={tip} />
      </div>
    </div>
  );

  function show(d: ExpiryBucket) {
    setActive(d.quarter);
    setTip({
      x: x(d.quarter)! + x.bandwidth() / 2,
      y: y(total(d)),
      title: `${quarterLabel(d.quarter)} · ${fmt.sqft(total(d))}`,
      rows: [...BANDS].reverse().map((b) => [RISK_LABEL[b], fmt.sqft(d[b]), RISK_COLOR[b]]),
      bounds: width,
    });
  }
}

export function ExpiryTable({ data }: { data: ExpiryBucket[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Quarter</th>
          {BANDS.map((b) => (
            <th key={b} className="num">
              {RISK_LABEL[b]}
            </th>
          ))}
          <th className="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.quarter}>
            <td className="cell-main">{d.quarter}</td>
            {BANDS.map((b) => (
              <td key={b} className="num">
                {fmt.sqftFull(d[b])}
              </td>
            ))}
            <td className="num">{fmt.sqftFull(d.high + d.medium + d.low)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
