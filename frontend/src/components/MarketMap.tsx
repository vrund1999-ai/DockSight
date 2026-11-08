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

interface Props {
  markets: MarketSummary[];
  selected?: string;
  onSelect: (code: string | undefined) => void;
}

/** Bubble map: area encodes portfolio square footage per market. One series -> one color. */
export function MarketMap({ markets, selected, onSelect }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(700);
  const [tip, setTip] = useState<TooltipState | null>(null);
  const height = Math.round(width * 0.58);

  const { path, project } = useMemo(() => {
    const projection = geoAlbersUsa().fitSize([width, height], nation);
    return {
      path: geoPath(projection),
      project: (m: MarketSummary) => projection([m.lon, m.lat]),
    };
  }, [width, height]);

  const radius = scaleSqrt()
    .domain([0, max(markets, (m) => m.total_sqft) ?? 1])
    .range([0, Math.max(14, width / 22)]);

  const show = (m: MarketSummary, x: number, y: number) =>
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
    });

  // Draw larger bubbles first so small ones stay clickable on top.
  const ordered = [...markets].sort((a, b) => b.total_sqft - a.total_sqft);

  return (
    <div className="chart" ref={ref} onPointerLeave={() => setTip(null)}>
      <svg width={width} height={height} role="img" aria-label="Map of portfolio markets">
        <path d={path(nation) ?? ""} className="state" />
        <path d={path(stateBorders) ?? ""} fill="none" stroke="var(--surface-1)" />
        {ordered.map((m) => {
          const p = project(m);
          if (!p) return null;
          const [x, y] = p;
          const r = radius(m.total_sqft);
          const side = LABEL_SIDE[m.code];
          const isSelected = selected === m.code;
          const toggle = () => onSelect(isSelected ? undefined : m.code);
          return (
            <g key={m.code}>
              <circle cx={x} cy={y} r={r} className={`bubble ${isSelected ? "selected" : ""}`} />
              <text
                x={side ? x : x + r + 5}
                y={side === "above" ? y - r - 6 : side === "below" ? y + r + 14 : y + 4}
                textAnchor={side ? "middle" : "start"}
                className={isSelected ? "label-primary" : "label-secondary"}
                fontWeight={isSelected ? 700 : 500}
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
                onBlur={() => setTip(null)}
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
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}
