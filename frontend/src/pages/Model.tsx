import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

const METRICS: [string, string, (v: number) => string][] = [
  ["roc_auc", "Holdout ROC AUC", (v) => v.toFixed(3)],
  ["brier", "Brier score", (v) => v.toFixed(3)],
  ["log_loss", "Log loss", (v) => v.toFixed(3)],
  ["base_rate", "Holdout renewal rate", (v) => `${(v * 100).toFixed(0)}%`],
  ["n_train", "Training leases", (v) => v.toLocaleString()],
];

export function Model() {
  const model = useQuery({ queryKey: ["model"], queryFn: api.model });
  const m = model.data;
  return (
    <>
      <div className="page-head">
        <h1>Model</h1>
        <p>Lease-renewal classifier serving the risk scores across DockSight.</p>
      </div>
      {m && (
        <>
          <div className="tiles">
            {METRICS.filter(([k]) => k in m.metrics).map(([k, label, f]) => (
              <div className="card tile" key={k}>
                <div className="label">{label}</div>
                <div className="value">{f(m.metrics[k])}</div>
              </div>
            ))}
          </div>
          <section className="card">
            <dl className="facts">
              <div>
                <dt>Version</dt>
                <dd>{m.version}</dd>
              </div>
              <div>
                <dt>Algorithm</dt>
                <dd>{m.algorithm.replace("_", " ")}</dd>
              </div>
              <div>
                <dt>Trained</dt>
                <dd>{new Date(m.trained_at).toLocaleString()}</dd>
              </div>
            </dl>
          </section>
          <section className="card secondary">
            <h2 style={{ fontSize: "1rem", marginTop: 0, color: "var(--text-primary)" }}>
              How it works
            </h2>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
              <li>
                Trained on expired leases with known outcomes; evaluated on a later, time-based
                holdout so scores reflect performance on leases it has never seen.
              </li>
              <li>
                Market conditions are captured 12 months before expiry, when renewal conversations
                start, so the model never uses information that wouldn't be available yet.
              </li>
              <li>
                Logistic regression and gradient boosting compete on every run; the holdout picks
                the winner. Runs are tracked in MLflow.
              </li>
              <li>
                Explore calibration and what-if scenarios in the Streamlit Model Lab (port 8501).
              </li>
            </ul>
          </section>
        </>
      )}
    </>
  );
}
