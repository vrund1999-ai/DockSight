import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, type Driver } from "../api";
import { DriversChart, DriversTable } from "../components/DriversChart";
import { ChartCard, RiskBadge } from "../components/primitives";
import { featureValue, fmt } from "../format";

/** One-sentence summary an asset manager can paste into an email. */
export function narrative(drivers: Driver[]): string {
  const worst = drivers.find((d) => d.impact < 0);
  const best = drivers.find((d) => d.impact > 0);
  const parts: string[] = [];
  if (worst)
    parts.push(
      `${worst.label.toLowerCase()} (${featureValue(worst.feature, worst.value)}) lowers renewal odds by ${Math.abs(worst.impact * 100).toFixed(1)} pts`,
    );
  if (best)
    parts.push(
      `${best.label.toLowerCase()} (${featureValue(best.feature, best.value)}) adds ${(best.impact * 100).toFixed(1)} pts`,
    );
  if (parts.length === 0) return "This lease looks like a typical lease in the portfolio.";
  const sentence = parts.join("; ");
  return `Compared with a typical lease, ${sentence}.`;
}

export function LeaseDetail() {
  const id = Number(useParams().id);
  const lease = useQuery({ queryKey: ["lease", id], queryFn: () => api.lease(id) });

  if (lease.error) return <p className="error">{String(lease.error)}</p>;
  const l = lease.data;
  if (!l) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <p>
          <Link to="/leases">← Lease expirations</Link>
        </p>
        <h1>{l.tenant}</h1>
        <p>
          {l.property} · {l.market} · {l.industry}
        </p>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Renewal probability</h2>
            <RiskBadge band={l.risk_band} />
          </div>
          <div className="hero">
            <span className="value">{fmt.pct(l.renewal_probability)}</span>
            <span className="secondary">
              expires {fmt.date(l.end_date)} (in {l.months_to_expiry} months)
            </span>
          </div>
        </section>
        <section className="card">
          <dl className="facts">
            <Fact label="Suite size" value={fmt.sqftFull(l.sqft)} />
            <Fact label="Starting rent" value={fmt.rent(l.rent_psf)} />
            <Fact label="Commenced" value={fmt.date(l.start_date)} />
            <Fact label="Prior renewals" value={String(l.prior_renewals)} />
            <Fact label="Tenant credit" value={l.credit_rating} />
            <Fact label="Built" value={String(l.year_built)} />
            <Fact label="Clear height" value={`${l.clear_height_ft} ft`} />
          </dl>
        </section>
      </div>

      <ChartCard
        title="Why this score?"
        subtitle="Change in renewal probability from each factor, versus a typical lease in the portfolio"
        chart={
          <>
            <p className="callout">{narrative(l.drivers)}</p>
            <DriversChart drivers={l.drivers} />
          </>
        }
        table={<DriversTable drivers={l.drivers} />}
      />
      <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
        Model {l.model_version}. Impacts are counterfactual: each factor is swapped for the
        portfolio-typical value while the others are held fixed, so they don't sum exactly to the
        total.
      </p>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
