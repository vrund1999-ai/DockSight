import { ChevronRight, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { LeaseRisk } from "../api";
import { fmt } from "../format";
import { RiskBadge } from "./primitives";
import { StateBlock } from "./ui";

export function LeaseTable({
  leases,
  dense = false,
  empty,
}: {
  leases: LeaseRisk[];
  dense?: boolean;
  empty?: ReactNode;
}) {
  const navigate = useNavigate();
  if (leases.length === 0)
    return (
      <StateBlock
        icon={SearchX}
        title="No leases match these filters"
        body="Try a longer window or a different market."
        action={empty}
      />
    );
  return (
    <div className="table-wrap">
      <table className={dense ? "dense" : ""}>
        <thead>
          <tr>
            <th>Tenant</th>
            <th className="col-md">Property</th>
            <th className="col-md">Market</th>
            <th className="num col-sm">Size</th>
            <th className="col-sm">Expires</th>
            <th className="num col-sm">Renewal odds</th>
            <th>Risk</th>
            <th className="col-sm" aria-hidden />
          </tr>
        </thead>
        <tbody>
          {leases.map((l) => {
            const href = `/leases/${l.lease_id}`;
            return (
              <tr
                key={l.lease_id}
                className="row-link"
                onClick={(e) => {
                  // The tenant link handles its own clicks (incl. cmd/middle-click).
                  if (!(e.target as HTMLElement).closest("a")) navigate(href);
                }}
              >
                <td>
                  <Link to={href} className="cell-main">
                    {l.tenant}
                  </Link>
                  <div className="cell-sub">
                    {l.industry} · {l.credit_rating}
                  </div>
                  <div className="cell-sub show-sm">
                    {l.market} · {fmt.sqft(l.sqft)} · {fmt.pct(l.renewal_probability)} odds
                  </div>
                  <div className="cell-sub show-sm">Expires {fmt.date(l.end_date)}</div>
                </td>
                <td className="col-md secondary">{l.property}</td>
                <td className="col-md">
                  <span className="tag">{l.market}</span>
                </td>
                <td className="num col-sm">{fmt.sqft(l.sqft)}</td>
                <td className="col-sm">
                  {fmt.date(l.end_date)}
                  <div className="cell-sub">in {l.months_to_expiry} mo</div>
                </td>
                <td className="num col-sm">
                  <span className="odds">
                    <span className="micro-meter" aria-hidden>
                      <span style={{ width: `${l.renewal_probability * 100}%` }} />
                    </span>
                    <span className="odds-value">{fmt.pct(l.renewal_probability)}</span>
                  </span>
                </td>
                <td>
                  <RiskBadge band={l.risk_band} />
                </td>
                <td className="col-sm" aria-hidden style={{ width: 1 }}>
                  <ChevronRight size={16} className="chev" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
