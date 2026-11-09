import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api, type LeaseQuery, type RiskBand } from "../api";
import { LeaseTable } from "../components/LeaseTable";
import { RiskShape } from "../components/primitives";
import { FilterSelect, PageHeader, SegmentedControl, Skeleton } from "../components/ui";
import { fmt } from "../format";

const PAGE = 25;
type BandFilter = RiskBand | "all";

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
  const clearFilters = () => setParams({}, { replace: true });
  const filtered = query.months !== 24 || !!query.market || !!query.band || query.sort !== "risk";

  const total = leases.data?.total ?? 0;
  const sqft = leases.data?.items.reduce((acc, l) => acc + l.sqft, 0) ?? 0;
  const page = Math.floor(query.offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
      <PageHeader
        title="Lease expirations"
        meta={
          leases.data
            ? `${total.toLocaleString()} active leases expiring within ${query.months} months · ranked by predicted renewal probability`
            : "Active leases ranked by predicted renewal probability"
        }
      />

      <section
        className={`card card--flush sticky-head ${leases.isPlaceholderData ? "is-stale" : ""}`}
        aria-label="Lease expirations"
        aria-busy={leases.isFetching || undefined}
      >
        <div className="toolbar">
          <FilterSelect
            prefix="Expiring within"
            value={String(query.months)}
            isDefault={query.months === 24}
            onChange={(v) => update("months", v)}
            options={[6, 12, 24, 36, 60].map((m) => ({ value: String(m), label: `${m} months` }))}
          />
          <FilterSelect
            prefix="Market"
            value={query.market ?? ""}
            isDefault={!query.market}
            onChange={(v) => update("market", v)}
            options={[
              { value: "", label: "All markets" },
              ...(markets.data ?? []).map((m) => ({ value: m.code, label: m.name })),
            ]}
          />
          <SegmentedControl<BandFilter>
            ariaLabel="Risk band"
            value={query.band ?? "all"}
            onChange={(v) => update("band", v === "all" ? undefined : v)}
            options={[
              { value: "all", label: "All" },
              {
                value: "high",
                label: "High risk",
                icon: <RiskShape band="high" />,
                title: "Renewal probability under 40%",
              },
              {
                value: "medium",
                label: "Watch",
                icon: <RiskShape band="medium" />,
                title: "Renewal probability 40–65%",
              },
              {
                value: "low",
                label: "Likely to renew",
                icon: <RiskShape band="low" />,
                title: "Renewal probability 65% or more",
              },
            ]}
          />
          <span className="spacer" />
          {filtered && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              Clear filters
            </button>
          )}
          <FilterSelect<LeaseQuery["sort"]>
            prefix="Sort"
            value={query.sort}
            onChange={(v) => update("sort", v === "risk" ? undefined : v)}
            options={[
              { value: "risk", label: "Highest risk" },
              { value: "expiry", label: "Soonest expiry" },
              { value: "sqft", label: "Largest" },
            ]}
          />
        </div>

        {leases.error && (
          <div style={{ padding: 20 }}>
            <div className="alert" role="alert">
              <CircleAlert size={16} aria-hidden />
              <span style={{ flex: 1 }}>Couldn&rsquo;t load leases: {String(leases.error)}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => leases.refetch()}>
                Retry
              </button>
            </div>
          </div>
        )}
        {leases.data ? (
          <LeaseTable
            leases={leases.data.items}
            empty={
              <button className="btn btn-secondary" onClick={clearFilters}>
                Clear filters
              </button>
            }
          />
        ) : (
          !leases.error && (
            <div style={{ padding: 20, display: "grid", gap: 14 }}>
              <span className="sr-only">Loading leases</span>
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} height={40} />
              ))}
            </div>
          )
        )}

        {total > 0 && (
          <div className="pager">
            <span>
              {query.offset + 1}–{Math.min(query.offset + PAGE, total)} of {total.toLocaleString()}{" "}
              · {fmt.sqft(sqft)} on this page
            </span>
            <span className="controls">
              <span>
                Page {page} of {pages}
              </span>
              <button
                className="btn btn-secondary btn-sm btn-icon"
                aria-label="Previous page"
                disabled={query.offset === 0}
                onClick={() => update("offset", String(Math.max(0, query.offset - PAGE)))}
              >
                <ChevronLeft size={16} aria-hidden />
              </button>
              <button
                className="btn btn-secondary btn-sm btn-icon"
                aria-label="Next page"
                disabled={query.offset + PAGE >= total}
                onClick={() => update("offset", String(query.offset + PAGE))}
              >
                <ChevronRight size={16} aria-hidden />
              </button>
            </span>
          </div>
        )}
      </section>
    </>
  );
}
