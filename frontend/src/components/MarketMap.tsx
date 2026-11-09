import { geoAlbersUsa, geoPath, max, scaleSqrt } from "d3";
import { useMemo, useState } from "react";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import usAtlas from "us-atlas/states-10m.json";
import type { MarketSummary } from "../api";
import { fmt } from "../format";
import { Tooltip, useWidth, type TooltipState } from "./primitives";

const us = usAtlas as unknown as Topology<{
  states: GeometryCollection;
  nation: GeometryCollection;
}>;
const nation = feature(us, us.objects.nation);
const stateBorders = mesh(us, us.objects.states, (a, b) => a !== b);

// NYC and PHL sit close together; push their labels apart.
const LABEL_SIDE: Record<string, "above" | "below"> = { NYC: "above", PHL: "below" };

/** Round a square-footage value down to a "nice" legend value (1, 2, 5 x 10^n). */
function niceFloor(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

interface Props {
  markets: MarketSummary[];
  selected?: string;
  onSelect: (code: string | undefined) => void;
}

/** Bubble map: area encodes portfolio square footage per market. One series -> one color. */
export function MarketMap({ markets, selected, onSelect }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(700);
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const height = Math.round(width * (width < 600 ? 0.64 : 0.58));

  const { path, project } = useMemo(() => {
    const projection = geoAlbersUsa().fitSize([width, height], nation);
    return {
      path: geoPath(projection),
      project: (m: MarketSummary) => projection([m.lon, m.lat]),
    };
  }, [width, height]);

  const maxSqft = max(markets, (m) => m.total_sqft) ?? 1;
  const radius = scaleSqrt()
    .domain([0, maxSqft])
    .range([0, Math.max(14, width / 22)]);
  const legendValues = [niceFloor(maxSqft), niceFloor(maxSqft / 4)];

  const show = (m: MarketSummary, x: number, y: number) => {
    setHovered(m.code);
    setTip({
      x,
      y: y - radius(m.total_sqft),
      title: m.name,
      rows: [
        ["Portfolio", fmt.sqft(m.total_sqft)],
        ["Properties", String(m.properties)],
        ["Occupancy", fmt.pct(m.occupancy, 1)],
        ["Market vacancy", fmt.pct(m.market_vacancy, 1)],
        ["Rent growth (YoY)", fmt.signedPct(m.rent_growth_yoy)],
        ["High-risk expiring (24m)", fmt.sqft(m.at_risk_24m_sqft)],
      ],
      bounds: width,
    });
  };
  const hide = () => {
    setTip(null);
    setHovered(null);
  };

  // Draw larger bubbles first so small ones stay clickable on top.
  const ordered = [...markets].sort((a, b) => b.total_sqft - a.total_sqft);
  const lr = radius(legendValues[0]);

  return (
    <div className="chart" ref={ref} onPointerLeave={hide}>
      <svg width={width} height={height} role="img" aria-label="Map of portfolio markets">
        <path d={path(nation) ?? ""} className="land" />
        <path d={path(stateBorders) ?? ""} className="borders" />
        {ordered.map((m) => {
          const p = project(m);
          if (!p) return null;
          const [x, y] = p;
          const r = radius(m.total_sqft);
          const side = LABEL_SIDE[m.code];
          const isSelected = selected === m.code;
          const faded = !!selected && !isSelected;
          const toggle = () => onSelect(isSelected ? undefined : m.code);
          return (
            <g key={m.code}>
              <circle
                cx={x}
                cy={y}
                r={r}
                className={`bubble ${isSelected ? "selected" : ""} ${faded ? "faded" : ""} ${hovered === m.code ? "hovered" : ""}`}
              />
              <text
                x={side ? x : x + r + 5}
                y={side === "above" ? y - r - 6 : side === "below" ? y + r + 14 : y + 4}
                textAnchor={side ? "middle" : "start"}
                className={`map-label ${isSelected ? "selected" : ""} ${faded ? "faded" : ""}`}
              >
                {m.code}
              </text>
              {/* Hit target: larger than the mark, keyboard-focusable. */}
              <circle
                cx={x}
                cy={y}
                r={Math.max(r + 4, 14)}
                className="hit"
                tabIndex={0}
                role="button"
                aria-pressed={isSelected}
                aria-label={`${m.name}: ${fmt.sqft(m.total_sqft)}, ${fmt.pct(m.occupancy)} occupied`}
                onPointerEnter={() => show(m, x, y)}
                onFocus={() => show(m, x, y)}
                onBlur={hide}
                onClick={toggle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle();
                  }
                }}
              />
            </g>
          );
        })}
        {/* Size legend: reference circles side by side on a surface plate, so area reads as SF. */}
        <g className="size-legend" transform={`translate(0, ${height - 2 * lr - 12})`} aria-hidden>
          <rect
            className="legend-plate"
            x={0}
            y={0}
            width={2 * lr + 2 * radius(legendValues[1]) + 104}
            height={2 * lr + 12}
            rx={8}
          />
          <circle cx={6 + lr} cy={6 + lr} r={lr} />
          <text x={12 + 2 * lr} y={10 + lr}>
            {fmt.sqft(legendValues[0])}
          </text>
          <circle
            cx={12 + 2 * lr + 46 + radius(legendValues[1])}
            cy={6 + lr}
            r={radius(legendValues[1])}
          />
          <text x={18 + 2 * lr + 46 + 2 * radius(legendValues[1])} y={10 + lr}>
            {fmt.sqft(legendValues[1])}
          </text>
        </g>
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}
