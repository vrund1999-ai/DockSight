import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, type LeaseQuery, type RiskBand } from "../api";
import { LeaseTable } from "../components/LeaseTable";
import { fmt } from "../format";

const PAGE = 25;

export function Leases() {
  const [params, setParams] = useSearchParams();
  const query: LeaseQuery = {
    months: Number(params.get("months") ?? 24),
    market: params.get("market") ?? undefined,
    band: (params.get("band") as RiskBand | null) ?? undefined,
    sort: (params.get("sort") as LeaseQuery["sort"] | null) ?? "risk",
    limit: PAGE,
    offset: Number(params.get("offset") ?? 0),
  };
  const markets = useQuery({ queryKey: ["markets"], queryFn: api.markets });
  const leases = useQuery({
    queryKey: ["leases", query],
    queryFn: () => api.expiringLeases(query),
    placeholderData: keepPreviousData,
  });

  const update = (key: string, value: string | undefined) =>
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        if (key !== "offset") p.delete("offset");
        return p;
      },
      { replace: true },
    );

  const total = leases.data?.total ?? 0;
  const sqft = leases.data?.items.reduce((acc, l) => acc + l.sqft, 0) ?? 0;

  return (
    <>
      <div className="page-head">
        <h1>Lease expirations</h1>
        <p>Active leases ranked by predicted renewal probability. Click a lease to see why.</p>
      </div>

      <div className="filters">
        <label>
          Expiring within
          <select value={query.months} onChange={(e) => update("months", e.target.value)}>
            {[6, 12, 24, 36, 60].map((m) => (
              <option key={m} value={m}>
                {m} months
              </option>
            ))}
          </select>
        </label>
        <label>
          Market
          <select value={query.market ?? ""} onChange={(e) => update("market", e.target.value)}>
            <option value="">All markets</option>
            {markets.data?.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Risk
          <select value={query.band ?? ""} onChange={(e) => update("band", e.target.value)}>
            <option value="">All</option>
            <option value="high">High risk (&lt;40%)</option>
            <option value="medium">Watch (40–65%)</option>
            <option value="low">Likely to renew (≥65%)</option>
          </select>
        </label>
        <label>
          Sort by
          <select value={query.sort} onChange={(e) => update("sort", e.target.value)}>
            <option value="risk">Highest risk</option>
            <option value="expiry">Soonest expiry</option>
            <option value="sqft">Largest</option>
          </select>
        </label>
      </div>

      <section className={`card ${leases.isPlaceholderData ? "stale" : ""}`}>
        {leases.error && <p className="error">{String(leases.error)}</p>}
        {leases.data && <LeaseTable leases={leases.data.items} />}
        <div className="pager">
          <span>
            {total === 0
              ? "No results"
              : `${query.offset + 1}–${Math.min(query.offset + PAGE, total)} of ${total} leases · ${fmt.sqft(sqft)} on this page`}
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              disabled={query.offset === 0}
              onClick={() => update("offset", String(Math.max(0, query.offset - PAGE)))}
            >
              Previous
            </button>
            <button
              className="btn"
              disabled={query.offset + PAGE >= total}
              onClick={() => update("offset", String(query.offset + PAGE))}
            >
              Next
            </button>
          </span>
        </div>
      </section>
    </>
  );
}
