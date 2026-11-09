import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  ChevronsUpDown,
  FileClock,
  FlaskConical,
  LayoutGrid,
  LogOut,
  Monitor,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import { Logo, SegmentedControl, Skeleton } from "./components/ui";
import { fmt } from "./format";
import { Login } from "./pages/Login";
import { useTheme, type ThemePref } from "./theme";

// Route-level code splitting: the map's TopoJSON only loads with the dashboard.
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Leases = lazy(() => import("./pages/Leases").then((m) => ({ default: m.Leases })));
const LeaseDetail = lazy(() =>
  import("./pages/LeaseDetail").then((m) => ({ default: m.LeaseDetail })),
);
const Model = lazy(() => import("./pages/Model").then((m) => ({ default: m.Model })));

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", label: "Portfolio", icon: LayoutGrid, end: true },
  { to: "/leases", label: "Leases", icon: FileClock },
  { to: "/model", label: "Model", icon: FlaskConical },
];

function NavLinks() {
  return NAV.map(({ to, label, icon: Icon, end }) => (
    <NavLink key={to} to={to} end={end}>
      <Icon size={16} strokeWidth={1.75} aria-hidden />
      {label}
    </NavLink>
  ));
}

function Shell() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <div className="shell">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <Logo /> DockSight
        </div>
        <nav aria-label="Main" className="nav">
          <NavLinks />
        </nav>
        <div className="sidebar-foot">
          <DataBlock />
          <UserMenu placement="up" />
        </div>
      </aside>
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">
            <Logo /> DockSight
          </div>
          <UserMenu placement="down" compact />
        </div>
        <nav aria-label="Main (compact)" className="tabs">
          <NavLinks />
        </nav>
      </header>
      <div className="content">
        <main id="content" className="page" tabIndex={-1}>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

/** Data freshness and the serving model, always visible. Shares the pages' cached queries. */
function DataBlock() {
  const summary = useQuery({ queryKey: ["summary"], queryFn: api.summary });
  const model = useQuery({ queryKey: ["model"], queryFn: api.model });
  return (
    <div className="data-block">
      <span>
        <CalendarClock size={14} aria-hidden />
        {summary.data ? `Data as of ${fmt.date(summary.data.as_of)}` : "Loading data…"}
      </span>
      {model.data && (
        <NavLink to="/model" title="Serving model">
          <FlaskConical size={14} aria-hidden />
          <span className="version">Model {model.data.version}</span>
        </NavLink>
      )}
    </div>
  );
}

function UserMenu({ placement, compact = false }: { placement: "up" | "down"; compact?: boolean }) {
  const { logout } = useAuth();
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div className="menu-anchor" ref={anchor}>
      <button
        ref={trigger}
        type="button"
        className={compact ? "btn btn-ghost btn-icon" : "user-trigger"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={compact ? "Account and theme" : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar" aria-hidden>
          A
        </span>
        {!compact && (
          <>
            <span className="grow">analyst</span>
            <ChevronsUpDown size={14} className="muted" aria-hidden />
          </>
        )}
      </button>
      {open && (
        <div className={`menu ${placement}`} id={menuId} role="menu" aria-label="Account">
          <div className="menu-section" role="none">
            <div className="menu-label">Theme</div>
            <SegmentedControl<ThemePref>
              size="sm"
              ariaLabel="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "system", label: "System", icon: <Monitor size={13} aria-hidden /> },
                { value: "light", label: "Light", icon: <Sun size={13} aria-hidden /> },
                { value: "dark", label: "Dark", icon: <Moon size={13} aria-hidden /> },
              ]}
            />
          </div>
          <div className="menu-sep" role="separator" />
          <button type="button" role="menuitem" className="menu-item" onClick={logout}>
            <LogOut size={15} aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <span className="sr-only">Loading page</span>
      <Skeleton width={220} height={28} />
      <Skeleton height={104} style={{ borderRadius: 12 }} />
      <Skeleton height={360} style={{ borderRadius: 12 }} />
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="leases" element={<Leases />} />
        <Route path="leases/:id" element={<LeaseDetail />} />
        <Route path="model" element={<Model />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
