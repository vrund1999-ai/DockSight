import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type MarketSummary } from "../api";
import { ExpiryChart, ExpiryTable } from "../components/ExpiryChart";
import { LeaseTable } from "../components/LeaseTable";
import { MarketMap } from "../components/MarketMap";
import { ChartCard } from "../components/primitives";
import { TrendChart } from "../components/TrendChart";
import { fmt, parseDay } from "../format";
import { useMarketParam } from "../hooks";

export function Dashboard() {
  const [market, setMarket] = useMarketParam();
  const summary = useQuery({ queryKey: ["summary"], queryFn: api.summary });
  const markets = useQuery({ queryKey: ["markets"], queryFn: api.markets });
  const expiry = useQuery({
    queryKey: ["expiry", market],
    queryFn: () => api.expirySchedule(market),
    placeholderData: keepPreviousData,
  });
  const trendMarket = market ?? markets.data?.[0]?.code;
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
  const rent = (history.data ?? []).map((m) => ({
    date: parseDay(m.month),
    value: m.avg_rent_psf,
  }));
  const vacancy = (history.data ?? []).map((m) => ({
    date: parseDay(m.month),
    value: m.vacancy_rate,
  }));

  return (
    <>
      <div className="page-head">
        <h1>Portfolio</h1>
        <p>{s ? `As of ${fmt.date(s.as_of)} · ${s.properties} properties` : "Loading…"}</p>
      </div>

      {s && (
        <div className="tiles" aria-label="Portfolio KPIs">
          <Tile
            label="Portfolio size"
            value={fmt.sqft(s.total_sqft)}
            sub={`${s.properties} buildings`}
          />
          <Tile
            label="Occupancy"
            value={fmt.pct(s.occupancy, 1)}
            sub={`${fmt.sqft(s.leased_sqft)} leased`}
          />
          <Tile
            label="Expiring in 24 months"
            value={fmt.sqft(s.expiring_24m_sqft)}
            sub={`${fmt.sqft(s.expiring_12m_sqft)} in next 12`}
          />
          <Tile
            label="High-risk expirations (24m)"
            value={fmt.sqft(s.at_risk_24m_sqft)}
            sub={`${fmt.pct(s.at_risk_24m_sqft / s.expiring_24m_sqft)} of expiring SF`}
          />
          <Tile
            label="Expected renewal rate (24m)"
            value={fmt.pct(s.expected_renewal_rate_24m)}
            sub="SF-weighted model forecast"
          />
        </div>
      )}

      {/* One filter row scopes everything below it. */}
      <div className="filters">
        <label>
          Market
          <select value={market ?? ""} onChange={(e) => setMarket(e.target.value || undefined)}>
            <option value="">All markets</option>
            {markets.data?.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {market && (
          <button className="btn ghost" onClick={() => setMarket(undefined)}>
            Clear
          </button>
        )}
      </div>

      <div className="grid-3-2">
        <ChartCard
          title="Markets"
          subtitle="Bubble area = portfolio square feet. Click a market to filter."
          chart={
            markets.data && (
              <MarketMap markets={markets.data} selected={market} onSelect={setMarket} />
            )
          }
          table={markets.data && <MarketTable markets={markets.data} />}
        />
        <ChartCard
          title="Expiry wall"
          subtitle={`Square feet expiring per quarter · ${market ?? "all markets"}`}
          className={expiry.isPlaceholderData ? "stale" : ""}
          chart={expiry.data && <ExpiryChart data={expiry.data} />}
          table={expiry.data && <ExpiryTable data={expiry.data} />}
        />
      </div>

      <div className={`grid-2 ${history.isPlaceholderData ? "stale" : ""}`}>
        <ChartCard
          title={`Market rent · ${selected?.name ?? ""}`}
          subtitle="Average asking rent, $/SF/yr"
          chart={<TrendChart data={rent} label="Avg rent" format={(v) => `$${v.toFixed(2)}`} />}
        />
        <ChartCard
          title={`Market vacancy · ${selected?.name ?? ""}`}
          subtitle="Share of market inventory vacant"
          chart={<TrendChart data={vacancy} label="Vacancy" format={(v) => fmt.pct(v, 1)} />}
        />
      </div>

      <section className={`card ${atRisk.isPlaceholderData ? "stale" : ""}`}>
        <div className="card-head">
          <div>
            <h2>Highest-risk expirations, next 12 months</h2>
            <p>Lowest predicted renewal probability first</p>
          </div>
          <Link to={`/leases${market ? `?market=${market}` : ""}`} className="btn ghost">
            View all →
          </Link>
        </div>
        {atRisk.data && <LeaseTable leases={atRisk.data.items} />}
      </section>
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="sub">{sub}</div>
    </div>
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
            <td>{m.name}</td>
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
