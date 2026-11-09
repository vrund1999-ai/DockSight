import { bisector, extent, line, scaleLinear, scaleTime, timeYear } from "d3";
import { useMemo, useState } from "react";
import { Tooltip, useWidth } from "./primitives";

export interface Point {
  date: Date;
  value: number;
}

interface Props {
  data: Point[];
  label: string;
  format: (v: number) => string;
  height?: number;
}

const M = { top: 12, right: 56, bottom: 24, left: 52 };
const monthFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });

/** Single-series line with crosshair tooltip and keyboard scrubbing. */
export function TrendChart({ data, label, format, height = 200 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(500);
  const [index, setIndex] = useState<number | null>(null);

  const { x, y, d } = useMemo(() => {
    const x = scaleTime()
      .domain(extent(data, (p) => p.date) as [Date, Date])
      .range([M.left, width - M.right]);
    const y = scaleLinear()
      .domain(extent(data, (p) => p.value) as [number, number])
      .nice(4)
      .range([height - M.bottom, M.top]);
    const d = line<Point>()
      .x((p) => x(p.date))
      .y((p) => y(p.value))(data);
    return { x, y, d };
  }, [data, width, height]);

  if (data.length === 0) return null;

  const years = timeYear.every(width < 420 ? 4 : 2)!.range(...(x.domain() as [Date, Date]));
  const last = data[data.length - 1];
  const hovered = index === null ? null : data[index];
  const nearest = bisector<Point, Date>((p) => p.date).center;

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={`${label} over time`}>
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
                {format(t)}
              </text>
            </g>
          ))}
        </g>
        <line
          className="baseline"
          x1={M.left}
          x2={width - M.right}
          y1={Math.round(height - M.bottom) + 0.5}
          y2={Math.round(height - M.bottom) + 0.5}
        />
        {years.map((t) => (
          <text key={+t} x={x(t)} y={height - 6} textAnchor="middle">
            {t.getFullYear()}
          </text>
        ))}
        <path
          d={d ?? ""}
          fill="none"
          stroke="var(--series-1)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Direct label on the endpoint only. */}
        <circle cx={x(last.date)} cy={y(last.value)} r={4} className="dot" />
        <text x={x(last.date) + 8} y={y(last.value) + 4} className="label-primary">
          {format(last.value)}
        </text>

        {hovered && (
          <g>
            <line
              className="crosshair"
              x1={x(hovered.date)}
              x2={x(hovered.date)}
              y1={M.top}
              y2={height - M.bottom}
            />
            <circle cx={x(hovered.date)} cy={y(hovered.value)} r={5} className="dot" />
          </g>
        )}
        <rect
          className="hit"
          x={M.left}
          y={0}
          width={Math.max(0, width - M.left - M.right)}
          height={height}
          tabIndex={0}
          aria-label={`Scrub ${label}; use arrow keys`}
          onPointerMove={(e) => {
            const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
            setIndex(nearest(data, x.invert(e.clientX - box.left)));
          }}
          onPointerLeave={() => setIndex(null)}
          onFocus={() => setIndex(data.length - 1)}
          onBlur={() => setIndex(null)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 12 : 1;
            if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, (i ?? data.length) - step));
            if (e.key === "ArrowRight") setIndex((i) => Math.min(data.length - 1, (i ?? 0) + step));
          }}
        />
      </svg>
      <Tooltip
        tip={
          hovered && {
            x: x(hovered.date),
            y: y(hovered.value),
            title: monthFmt(hovered.date),
            rows: [[label, format(hovered.value), "var(--series-1)"]],
            bounds: width,
          }
        }
      />
    </div>
  );
}
