import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";
import { api, type ExpiryBucket, type MarketSummary } from "../api";
import { ExpiryChart, ExpiryTable } from "../components/ExpiryChart";
import { LeaseTable } from "../components/LeaseTable";
import { MarketMap } from "../components/MarketMap";
import { ChartCard } from "../components/primitives";
import { TrendChart, type Point } from "../components/TrendChart";
import {
  Chip,
  Delta,
  FilterSelect,
  KpiStrip,
  KpiTile,
  Meter,
  PageHeader,
  Skeleton,
} from "../components/ui";
import { fmt, parseDay, yearChange } from "../format";
import { useMarketParam } from "../hooks";

const monthYear = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });

export function Dashboard() {
  const [market, setMarket] = useMarketParam();
  const summary = useQuery({ queryKey: ["summary"], queryFn: api.summary });
  const markets = useQuery({ queryKey: ["markets"], queryFn: api.markets });
  const expiry = useQuery({
    queryKey: ["expiry", market],
    queryFn: () => api.expirySchedule(market),
    placeholderData: keepPreviousData,
  });
  // With no market chosen the trends show the largest market, and say so.
  const largest = markets.data?.reduce<MarketSummary | undefined>(
    (a, m) => (!a || m.total_sqft > a.total_sqft ? m : a),
    undefined,
  );
  const trendMarket = market ?? largest?.code;
  const history = useQuery({
    queryKey: ["history", trendMarket],
    queryFn: () => api.marketHistory(trendMarket!),
    enabled: !!trendMarket,
    placeholderData: keepPreviousData,
  });
  const atRisk = useQuery({
    queryKey: ["leases", "top", market],
    queryFn: () => api.expiringLeases({ months: 12, market, sort: "risk", limit: 5, offset: 0 }),
    placeholderData: keepPreviousData,
  });

  const s = summary.data;
  const selected = markets.data?.find((m) => m.code === trendMarket);
  const selectedName = markets.data?.find((m) => m.code === market)?.name;
  const rent: Point[] = (history.data ?? []).map((m) => ({
    date: parseDay(m.month),
    value: m.avg_rent_psf,
  }));
  const vacancy: Point[] = (history.data ?? []).map((m) => ({
    date: parseDay(m.month),
    value: m.vacancy_rate,
  }));
  const hint = market
    ? "Scopes the expiry wall, market trends and risk list"
    : selected && `Trends show ${selected.name}, the largest market, until you pick one`;

  return (
    <>
      <PageHeader
        title="Portfolio"
        meta={
          s && markets.data
            ? `${s.properties} properties · ${fmt.sqft(s.total_sqft)} across ${markets.data.length} markets`
            : " "
        }
        actions={
          s && (
            <span className="status-pill hide-lg">
              <CalendarClock size={13} aria-hidden /> As of {fmt.date(s.as_of)}
            </span>
          )
        }
      />

      <KpiStrip label="Portfolio KPIs">
        {s ? (
          <>
            <KpiTile
              label="Portfolio size"
              value={fmt.sqft(s.total_sqft)}
              sub={`${s.properties} buildings`}
            />
            <KpiTile
              label="Occupancy"
              value={fmt.pct(s.occupancy, 1)}
              sub={`${fmt.sqft(s.leased_sqft)} leased`}
            >
              <Meter value={s.occupancy} label={`Occupancy ${fmt.pct(s.occupancy, 1)}`} />
            </KpiTile>
            <KpiTile
              label="Expiring in 24 months"
              value={fmt.sqft(s.expiring_24m_sqft)}
              sub={`${fmt.sqft(s.expiring_12m_sqft)} in the next 12`}
            />
            <KpiTile
              label="High-risk expirations (24m)"
              value={fmt.sqft(s.at_risk_24m_sqft)}
              sub={`${fmt.pct(s.expiring_24m_sqft ? s.at_risk_24m_sqft / s.expiring_24m_sqft : 0)} of expiring SF`}
            />
            <KpiTile
              label="Expected renewal rate (24m)"
              value={fmt.pct(s.expected_renewal_rate_24m)}
              sub="SF-weighted model forecast"
            />
          </>
        ) : (
          [0, 1, 2, 3, 4].map((i) => (
            <KpiTile key={i} label={" "} value={<Skeleton width="60%" height={28} />} />
          ))
        )}
      </KpiStrip>

      {/* One filter row scopes everything below it. */}
      <div className="filter-bar">
        <FilterSelect
          prefix="Market"
          value={market ?? ""}
          isDefault={!market}
          onChange={(v) => setMarket(v || undefined)}
          options={[
            { value: "", label: "All markets" },
            ...(markets.data ?? []).map((m) => ({ value: m.code, label: m.name })),
          ]}
        />
        {market && selectedName && (
          <>
            <Chip
              label={selectedName}
              onRemove={() => setMarket(undefined)}
              removeLabel="Remove market filter"
            />
            <button className="btn btn-ghost btn-sm" onClick={() => setMarket(undefined)}>
              Clear
            </button>
          </>
        )}
        {hint && <span className="hint">{hint}</span>}
      </div>

      <div className="grid-12">
        <ChartCard
          className="span-7"
          title="Markets"
          subtitle="Bubble area = portfolio square feet · click a market to filter"
          loading={!markets.data}
          skeletonHeight={360}
          chart={
            markets.data && (
              <MarketMap markets={markets.data} selected={market} onSelect={setMarket} />
            )
          }
          table={markets.data && <MarketTable markets={markets.data} />}
        />
        <ChartCard
          className="span-5"
          title="Expiry wall"
          subtitle={`SF expiring per quarter · ${selectedName ?? "All markets"}`}
          loading={!expiry.data}
          stale={expiry.isPlaceholderData}
          skeletonHeight={280}
          chart={expiry.data && <ExpiryChart data={expiry.data} height={280} />}
          table={expiry.data && <ExpiryTable data={expiry.data} />}
          footer={expiry.data && <ExpiryFooter data={expiry.data} />}
        />

        <ChartCard
          className="span-6"
          title={`Market rent${selected ? ` · ${selected.name}` : ""}`}
          subtitle="Average asking rent, $/SF/yr"
          loading={!history.data}
          stale={history.isPlaceholderData}
          skeletonHeight={236}
          chart={
            <>
              <TrendStat
                points={rent}
                value={rent.length ? `$${rent[rent.length - 1].value.toFixed(2)}` : ""}
                unit="/SF/yr"
                change={yearChange(
                  rent.map((p) => p.value),
                  "relative",
                  true,
                )}
              />
              <TrendChart data={rent} label="Avg rent" format={(v) => `$${v.toFixed(2)}`} />
            </>
          }
        />
        <ChartCard
          className="span-6"
          title={`Market vacancy${selected ? ` · ${selected.name}` : ""}`}
          subtitle="Share of market inventory vacant"
          loading={!history.data}
          stale={history.isPlaceholderData}
          skeletonHeight={236}
          chart={
            <>
              <TrendStat
                points={vacancy}
                value={vacancy.length ? fmt.pct(vacancy[vacancy.length - 1].value, 1) : ""}
                unit="vacant"
                change={yearChange(
                  vacancy.map((p) => p.value),
                  "points",
                  false,
                )}
              />
              <TrendChart data={vacancy} label="Vacancy" format={(v) => fmt.pct(v, 1)} />
            </>
          }
        />

        <section
          className={`card card--flush span-12 ${atRisk.isPlaceholderData ? "is-stale" : ""}`}
          aria-label="Highest-risk expirations"
        >
          <div className="card-head">
            <div>
              <h2>Highest-risk expirations, next 12 months</h2>
              <p className="sub">Lowest predicted renewal probability first</p>
            </div>
            <Link to={`/leases${market ? `?market=${market}` : ""}`} className="link">
              View all leases <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          <div className="card-body">
            {atRisk.data ? (
              <LeaseTable leases={atRisk.data.items} dense />
            ) : (
              <div style={{ padding: "0 20px 20px", display: "grid", gap: 12 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} height={36} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function TrendStat({
  points,
  value,
  unit,
  change,
}: {
  points: Point[];
  value: string;
  unit: string;
  change: ReturnType<typeof yearChange>;
}) {
  if (points.length === 0) return null;
  const then = points.length >= 13 ? points[points.length - 13].date : undefined;
  return (
    <div className="stat-row">
      <span className="stat">{value}</span>
      <span className="unit">{unit}</span>
      {change && then && <Delta delta={{ ...change, vs: monthYear(then) }} />}
    </div>
  );
}

function ExpiryFooter({ data }: { data: ExpiryBucket[] }) {
  const total = (d: ExpiryBucket) => d.high + d.medium + d.low;
  const peak = data.reduce((a, d) => (total(d) > total(a) ? d : a), data[0]);
  const all = data.reduce((acc, d) => acc + total(d), 0);
  const high = data.reduce((acc, d) => acc + d.high, 0);
  if (!peak || all === 0) return null;
  return (
    <>
      <span>
        Peak quarter{" "}
        <b>
          {peak.quarter.slice(5)} &rsquo;{peak.quarter.slice(2, 4)} · {fmt.sqft(total(peak))}
        </b>
      </span>
      <span>
        High-risk share <b>{fmt.pct(high / all)}</b>
      </span>
    </>
  );
}

function MarketTable({ markets }: { markets: MarketSummary[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Market</th>
          <th className="num">Portfolio</th>
          <th className="num">Occupancy</th>
          <th className="num">Mkt vacancy</th>
          <th className="num">Mkt rent</th>
          <th className="num">Rent YoY</th>
          <th className="num">High-risk 24m</th>
        </tr>
      </thead>
      <tbody>
        {markets.map((m) => (
          <tr key={m.code}>
            <td className="cell-main">{m.name}</td>
            <td className="num">{fmt.sqft(m.total_sqft)}</td>
            <td className="num">{fmt.pct(m.occupancy, 1)}</td>
            <td className="num">{fmt.pct(m.market_vacancy, 1)}</td>
            <td className="num">{fmt.rent(m.market_rent_psf)}</td>
            <td className="num">{fmt.signedPct(m.rent_growth_yoy)}</td>
            <td className="num">{fmt.sqft(m.at_risk_24m_sqft)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
