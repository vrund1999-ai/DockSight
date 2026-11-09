import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Info } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api, type Driver, type LeaseDetail as Lease } from "../api";
import { DriversChart, DriversTable } from "../components/DriversChart";
import { ChartCard, RISK_LABEL, RiskBadge, RiskShape } from "../components/primitives";
import { CopyButton, PageHeader, Skeleton, StateBlock } from "../components/ui";
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

// Risk-band thresholds, matching the API's risk_band and the Leases filter.
const HIGH_BELOW = 0.4;
const LIKELY_FROM = 0.65;

export function LeaseDetail() {
  const id = Number(useParams().id);
  const lease = useQuery({ queryKey: ["lease", id], queryFn: () => api.lease(id) });

  if (lease.error)
    return (
      <section className="card">
        <StateBlock
          icon={CircleAlert}
          title="Couldn't load this lease"
          body={String(lease.error)}
          action={
            <span style={{ display: "flex", gap: 8 }}>
              <Link to="/leases" className="btn btn-secondary">
                Back to leases
              </Link>
              <button className="btn btn-primary" onClick={() => lease.refetch()}>
                Retry
              </button>
            </span>
          }
        />
      </section>
    );
  const l = lease.data;
  if (!l) return <DetailSkeleton />;

  const summary = narrative(l.drivers);
  const copyText = `${l.tenant} (${l.property}, ${l.market}): ${fmt.pct(l.renewal_probability)} renewal probability, ${RISK_LABEL[l.risk_band].toLowerCase()}, expires ${fmt.date(l.end_date)}. ${summary}`;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Leases", to: "/leases" }, { label: l.tenant }]}
        title={l.tenant}
        badge={<RiskBadge band={l.risk_band} />}
        meta={`${l.property} · ${l.market} · ${l.industry} · Credit ${l.credit_rating}`}
        actions={<CopyButton text={copyText} label="Copy summary" />}
      />

      <div className="grid-12">
        <section className="card span-5" aria-label="Renewal probability">
          <div className="card-body" style={{ paddingTop: 20 }}>
            <div className="hero-label">Renewal probability</div>
            <div className="hero-value">{fmt.pct(l.renewal_probability)}</div>
            <div className="hero-meta">
              Expires {fmt.date(l.end_date)} · in {l.months_to_expiry} months
            </div>
            <ProbabilityScale p={l.renewal_probability} band={l.risk_band} />
          </div>
        </section>
        <section className="card span-7" aria-label="Lease facts">
          <div className="card-head">
            <h2>Lease facts</h2>
          </div>
          <div className="card-body" style={{ paddingTop: 4 }}>
            <dl className="facts-list">
              <Fact label="Suite size" value={fmt.sqftFull(l.sqft)} />
              <Fact label="Starting rent" value={fmt.rent(l.rent_psf)} />
              <Fact label="Term" value={`${fmt.date(l.start_date)} – ${fmt.date(l.end_date)}`} />
              <Fact label="Prior renewals" value={String(l.prior_renewals)} />
              <Fact label="Tenant credit" value={l.credit_rating} />
              <Fact label="Industry" value={l.industry} />
              <Fact label="Built" value={String(l.year_built)} />
              <Fact label="Clear height" value={`${l.clear_height_ft} ft`} />
            </dl>
          </div>
        </section>

        <ChartCard
          className="span-12"
          title="Why this score?"
          subtitle="Change in renewal probability from each factor, versus a typical lease in the portfolio"
          chart={
            <>
              <div className="summary-callout">
                <div className="grow">
                  <div className="label">Summary</div>
                  <p>{summary}</p>
                </div>
              </div>
              <DriversChart drivers={l.drivers} />
            </>
          }
          table={<DriversTable drivers={l.drivers} />}
        />
      </div>

      <p className="footnote">
        <Info size={14} aria-hidden />
        <span>
          <Link to="/model" className="link">
            Model {l.model_version}
          </Link>
          . Impacts are counterfactual: each factor is swapped for the portfolio-typical value while
          the others are held fixed, so they don&rsquo;t sum exactly to the total.
        </span>
      </p>
    </>
  );
}

/** Where this lease sits against the risk-band thresholds. Shapes + labels carry the bands. */
function ProbabilityScale({ p, band }: { p: number; band: Lease["risk_band"] }) {
  const pct = (v: number) => `${v * 100}%`;
  return (
    <div
      className="prob-scale"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      aria-valuetext={`${fmt.pct(p)}, ${RISK_LABEL[band].toLowerCase()} band`}
      aria-label="Renewal probability scale"
    >
      <div className="prob-track">
        <span className="fill" style={{ width: pct(p) }} />
        <span className="tick" style={{ left: pct(HIGH_BELOW) }} />
        <span className="tick" style={{ left: pct(LIKELY_FROM) }} />
        <span className="marker" style={{ left: pct(p) }} />
      </div>
      {/* Row 1: thresholds under their ticks. Row 2: each zone label centered in its segment. */}
      <div className="prob-ticks" aria-hidden>
        <span style={{ left: 0 }}>0%</span>
        <span style={{ left: pct(HIGH_BELOW) }}>40%</span>
        <span style={{ left: pct(LIKELY_FROM) }}>65%</span>
        <span style={{ left: "100%" }}>100%</span>
      </div>
      <div className="prob-zones" aria-hidden>
        <span style={{ left: pct(HIGH_BELOW / 2) }}>
          <RiskShape band="high" /> High risk
        </span>
        <span style={{ left: pct((HIGH_BELOW + LIKELY_FROM) / 2) }}>
          <RiskShape band="medium" /> Watch
        </span>
        <span style={{ left: pct((LIKELY_FROM + 1) / 2) }}>
          <RiskShape band="low" /> Likely
        </span>
      </div>
    </div>
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

function DetailSkeleton() {
  return (
    <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <span className="sr-only">Loading lease</span>
      <Skeleton width={160} height={14} />
      <Skeleton width={320} height={28} />
      <div className="grid-12">
        <Skeleton height={220} style={{ borderRadius: 12, gridColumn: "span 5" }} />
        <Skeleton height={220} style={{ borderRadius: 12, gridColumn: "span 7" }} />
        <Skeleton height={380} style={{ borderRadius: 12, gridColumn: "span 12" }} />
      </div>
    </div>
  );
}
