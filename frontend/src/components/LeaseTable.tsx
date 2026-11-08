import { useNavigate } from "react-router-dom";
import type { LeaseRisk } from "../api";
import { fmt } from "../format";
import { RiskBadge } from "./primitives";

export function LeaseTable({ leases }: { leases: LeaseRisk[] }) {
  const navigate = useNavigate();
  if (leases.length === 0) return <p className="muted">No leases match these filters.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Property</th>
            <th>Market</th>
            <th className="num">Size</th>
            <th>Expires</th>
            <th className="num">Renewal odds</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {leases.map((l) => {
            const open = () => navigate(`/leases/${l.lease_id}`);
            return (
              <tr
                key={l.lease_id}
                className="clickable"
                tabIndex={0}
                onClick={open}
                onKeyDown={(e) => e.key === "Enter" && open()}
              >
                <td>
                  {l.tenant}
                  <div className="muted">
                    {l.industry} · {l.credit_rating}
                  </div>
                </td>
                <td className="secondary">{l.property}</td>
                <td>{l.market}</td>
                <td className="num">{fmt.sqft(l.sqft)}</td>
                <td>
                  {fmt.date(l.end_date)}
                  <div className="muted">in {l.months_to_expiry} mo</div>
                </td>
                <td className="num">{fmt.pct(l.renewal_probability)}</td>
                <td>
                  <RiskBadge band={l.risk_band} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
