import { lazy, Suspense } from "react";
import { Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Login } from "./pages/Login";

// Route-level code splitting: the map's TopoJSON only loads with the dashboard.
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Leases = lazy(() => import("./pages/Leases").then((m) => ({ default: m.Leases })));
const LeaseDetail = lazy(() =>
  import("./pages/LeaseDetail").then((m) => ({ default: m.LeaseDetail })),
);
const Model = lazy(() => import("./pages/Model").then((m) => ({ default: m.Model })));

function Shell() {
  const { isAuthenticated, logout } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden /> DockSight
        </div>
        <nav aria-label="Main">
          <NavLink to="/" end>
            Portfolio
          </NavLink>
          <NavLink to="/leases">Leases</NavLink>
          <NavLink to="/model">Model</NavLink>
        </nav>
        <button className="btn ghost" onClick={logout}>
          Sign out
        </button>
      </header>
      <main>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </>
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
