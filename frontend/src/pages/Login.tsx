import {
  CalendarRange,
  CircleAlert,
  Eye,
  EyeOff,
  LineChart,
  LoaderCircle,
  ScanSearch,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Logo } from "../components/ui";

const DEMO = { username: "analyst", password: "docksight" };

const VALUES = [
  {
    icon: CalendarRange,
    title: "Expiry wall across every market",
    body: "Square feet rolling each quarter, split by renewal risk.",
  },
  {
    icon: ScanSearch,
    title: "Explainable renewal scores",
    body: "Every lease shows which factors move its odds, in plain language.",
  },
  {
    icon: LineChart,
    title: "Market rent and vacancy trends",
    body: "Ten years of market context behind every renewal conversation.",
  },
];

export function Login() {
  const { isAuthenticated, login } = useAuth();
  const [username, setUsername] = useState(DEMO.username);
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <aside className="login-story">
        <div className="brand">
          <Logo /> DockSight
        </div>
        <h1>Lease-renewal risk, before it hits the rent roll.</h1>
        <p className="lede">
          Portfolio analytics for last-mile industrial: which tenants are likely to leave, when, and
          why.
        </p>
        <ul className="value-list">
          {VALUES.map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <span className="icon-tile">
                <Icon size={16} aria-hidden />
              </span>
              <div>
                <b>{title}</b>
                <span>{body}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="caption foot">Portfolio demo · synthetic data</p>
      </aside>

      <div className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <div className="brand">
            <Logo /> DockSight
          </div>
          <div>
            <h2>Sign in</h2>
            <p className="secondary" style={{ marginTop: 4 }}>
              Use your DockSight account.
            </p>
          </div>
          <label className="field">
            Username
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              aria-invalid={!!error}
              required
            />
          </label>
          <label className="field">
            Password
            <span className="input-wrap">
              <input
                className="input"
                type={reveal ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-invalid={!!error}
                style={{ paddingRight: 40 }}
                required
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon"
                aria-label={reveal ? "Hide password" : "Show password"}
                aria-pressed={reveal}
                onClick={() => setReveal((r) => !r)}
              >
                {reveal ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
              </button>
            </span>
          </label>
          {error && (
            <div className="alert" role="alert">
              <CircleAlert size={16} aria-hidden />
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy && <LoaderCircle size={16} className="spinner" aria-hidden />}
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <div className="divider" />
          <div className="demo-callout">
            <span>
              Demo account: <b>analyst</b> / <b>docksight</b>
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setUsername(DEMO.username);
                setPassword(DEMO.password);
                setError(null);
              }}
            >
              Use demo account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
