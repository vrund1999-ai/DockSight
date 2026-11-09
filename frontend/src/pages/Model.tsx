import { useQuery } from "@tanstack/react-query";
import { Clock, Database, FlaskConical, Trophy, type LucideIcon } from "lucide-react";
import { api } from "../api";
import { CopyButton, KpiStrip, KpiTile, PageHeader, Skeleton } from "../components/ui";

const METRICS: [string, string, (v: number) => string, string][] = [
  ["roc_auc", "Holdout ROC AUC", (v) => v.toFixed(3), "0.5 = random · 1.0 = perfect"],
  ["brier", "Brier score", (v) => v.toFixed(3), "Lower is better · 0.25 = coin flip"],
  ["log_loss", "Log loss", (v) => v.toFixed(3), "Lower is better · 0.693 = coin flip"],
  ["base_rate", "Holdout renewal rate", (v) => `${(v * 100).toFixed(0)}%`, "Share that renewed"],
  ["n_train", "Training leases", (v) => v.toLocaleString(), "Expired leases, known outcome"],
];

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Database,
    title: "Learn from expired leases",
    body: "Trained on leases whose outcome is known, then evaluated on a later, time-based holdout so scores reflect leases it has never seen.",
  },
  {
    icon: Clock,
    title: "Only use what was knowable",
    body: "Market conditions are captured 12 months before expiry, when renewal conversations start, so the model never sees information that wouldn't exist yet.",
  },
  {
    icon: Trophy,
    title: "Let the holdout pick the winner",
    body: "Logistic regression and gradient boosting compete on every run; the better holdout log loss serves. Every run is tracked in MLflow.",
  },
  {
    icon: FlaskConical,
    title: "Inspect it in the Model Lab",
    body: "Calibration, score separation and what-if scenarios live in the Streamlit Model Lab.",
  },
];

const titleCase = (s: string) => s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

function relativeTime(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return "just now";
}

export function Model() {
  const model = useQuery({ queryKey: ["model"], queryFn: api.model });
  const m = model.data;
  return (
    <>
      <PageHeader
        title="Model"
        meta="Lease-renewal classifier serving every risk score in DockSight."
      />
      <KpiStrip label="Model metrics">
        {m
          ? METRICS.filter(([k]) => k in m.metrics).map(([k, label, f, caption]) => (
              <KpiTile key={k} label={label} value={f(m.metrics[k])} sub={caption} />
            ))
          : [0, 1, 2, 3, 4].map((i) => (
              <KpiTile key={i} label={" "} value={<Skeleton width="60%" height={28} />} />
            ))}
      </KpiStrip>

      <div className="grid-12">
        <section className="card span-4" aria-label="Serving model">
          <div className="card-head">
            <h2>Serving model</h2>
            <span className="status-pill">
              <span className="dot" aria-hidden /> Serving
            </span>
          </div>
          <div className="card-body">
            {m ? (
              <dl className="champion" style={{ margin: 0 }}>
                <div className="kv">
                  <dt>Version</dt>
                  <dd>
                    <span className="mono">{m.version}</span>
                    <CopyButton
                      text={m.version}
                      label="Copy model version"
                      iconOnly
                      className="btn btn-ghost btn-sm"
                    />
                  </dd>
                </div>
                <div className="kv">
                  <dt>Algorithm</dt>
                  <dd>{titleCase(m.algorithm)}</dd>
                </div>
                <div className="kv">
                  <dt>Trained</dt>
                  <dd>
                    <time
                      dateTime={m.trained_at}
                      title={new Date(m.trained_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    >
                      {relativeTime(m.trained_at)}
                    </time>
                  </dd>
                </div>
              </dl>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <Skeleton height={36} />
                <Skeleton height={36} />
                <Skeleton height={36} />
              </div>
            )}
          </div>
        </section>

        <section className="card span-8" aria-label="How it works">
          <div className="card-head">
            <h2>How it works</h2>
          </div>
          <div className="card-body">
            <ol className="stepper">
              {STEPS.map(({ icon: Icon, title, body }) => (
                <li key={title}>
                  <span className="step-icon">
                    <Icon size={14} aria-hidden />
                  </span>
                  <div>
                    <b>{title}</b>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </>
  );
}
