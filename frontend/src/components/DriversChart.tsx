import { max, scaleLinear } from "d3";
import type { Driver } from "../api";
import { featureValue, fmt } from "../format";
import { useWidth } from "./primitives";
import { barPath } from "./shapes";

const ROW = 34;
const BAR_H = 14;
const LABEL_W = 250; // Fits "119% of market (typical 88% of market)".
const VALUE_PAD = 68; // Room for the "-17.1 pts" label at either bar end.

/**
 * Diverging bars: how much each factor moves this lease's renewal probability compared with a
 * typical lease. Blue helps renewal, red hurts; the gray zero line is "no effect".
 */
export function DriversChart({ drivers, limit = 8 }: { drivers: Driver[]; limit?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(600);
  const rows = drivers.slice(0, limit);
  const height = rows.length * ROW + 8;
  const extentAbs = max(rows, (d) => Math.abs(d.impact)) || 0.01;
  const x = scaleLinear()
    .domain([-extentAbs, extentAbs])
    .range([LABEL_W + VALUE_PAD, Math.max(LABEL_W + VALUE_PAD + 40, width - VALUE_PAD)]);
  const zero = x(0);

  return (
    <div className="chart" ref={ref}>
      <div className="legend">
        <span>
          <Swatch color="var(--diverge-pos)" /> Raises renewal odds
        </span>
        <span>
          <Swatch color="var(--diverge-neg)" /> Lowers renewal odds
        </span>
      </div>
      <svg width={width} height={height} role="img" aria-label="Drivers of this renewal score">
        {rows.map((d, i) => {
          const y = i * ROW + 4;
          const positive = d.impact >= 0;
          const end = x(d.impact);
          return (
            <g key={d.feature}>
              <text x={0} y={y + 12} className="label-primary">
                {d.label}
              </text>
              <text x={0} y={y + 26}>
                {featureValue(d.feature, d.value)}
                <tspan dx={4}>(typical {featureValue(d.feature, d.typical_value)})</tspan>
              </text>
              <path
                d={barPath(zero, end, y + (ROW - BAR_H) / 2 - 2, BAR_H)}
                fill={positive ? "var(--diverge-pos)" : "var(--diverge-neg)"}
              >
                <title>{`${d.label}: ${fmt.points(d.impact)}`}</title>
              </path>
              <text
                x={end + (positive ? 6 : -6)}
                y={y + ROW / 2 + 2}
                textAnchor={positive ? "start" : "end"}
                className="label-secondary"
                fontVariant="tabular-nums"
              >
                {fmt.points(d.impact)}
              </text>
            </g>
          );
        })}
        <line className="baseline" x1={zero} x2={zero} y1={0} y2={height} />
      </svg>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <svg width={10} height={10} aria-hidden>
      <rect width={10} height={10} rx={2} fill={color} />
    </svg>
  );
}

export function DriversTable({ drivers }: { drivers: Driver[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Factor</th>
          <th>This lease</th>
          <th>Typical lease</th>
          <th className="num">Impact on renewal odds</th>
        </tr>
      </thead>
      <tbody>
        {drivers.map((d) => (
          <tr key={d.feature}>
            <td>{d.label}</td>
            <td>{featureValue(d.feature, d.value)}</td>
            <td className="secondary">{featureValue(d.feature, d.typical_value)}</td>
            <td className="num">{fmt.points(d.impact)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
