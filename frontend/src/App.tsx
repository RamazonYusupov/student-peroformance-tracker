import { ReactNode, useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import DashboardPage from "./pages/DashboardPage";
import GroupsPage from "./pages/GroupsPage";
import LoginPage from "./pages/LoginPage";
import ResultsPage from "./pages/ResultsPage";
import StudentEntryPage from "./pages/StudentEntryPage";
import StudentTestPage from "./pages/StudentTestPage";
import TestsPage from "./pages/TestsPage";

function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem("teacher_token");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const navItems = [
    { to: "/", label: "Dashboard" },
    { to: "/tests", label: "Tests" },
    { to: "/groups", label: "Groups" },
  ];

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  const activeSection = useMemo(
    () => navItems.find((item) => (item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to))),
    [location.pathname],
  );

  const formattedToday = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
    [],
  );

  const logout = () => {
    localStorage.removeItem("teacher_token");
    navigate("/login", { replace: true });
  };

  return (
    <div className={`app-shell ${token ? "with-sidebar" : ""}`}>
      {token && (
        <>
          <button
            type="button"
            className="mobile-nav-toggle"
            onClick={() => setIsMobileNavOpen((prev) => !prev)}
            aria-expanded={isMobileNavOpen}
            aria-label="Toggle navigation"
          >
            Menu
          </button>
          <aside className={`sidebar ${isMobileNavOpen ? "open" : ""}`}>
            <div className="sidebar-brand">
              <h2>Teacher Hub</h2>
              <p>Student Performance Tracker</p>
            </div>
            <nav className="sidebar-nav">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="sidebar-footer">
              <button onClick={logout}>Logout</button>
            </div>
          </aside>
          {isMobileNavOpen && <div className="sidebar-scrim" onClick={() => setIsMobileNavOpen(false)} />}
        </>
      )}
      <main className="main-content">
        {token && (
          <header className="app-topbar">
            <div>
              <p className="app-topbar-label">Workspace</p>
              <h2>{activeSection?.label || "Overview"}</h2>
            </div>
            <div className="app-topbar-meta">
              <span className="topbar-date-chip">{formattedToday}</span>
              <button className="btn-ghost btn-sm" type="button" onClick={logout}>
                Sign Out
              </button>
            </div>
          </header>
        )}
        <section className="main-content-inner">{children}</section>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Shell>
              <DashboardPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/tests"
        element={
          <ProtectedRoute>
            <Shell>
              <TestsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/groups"
        element={
          <ProtectedRoute>
            <Shell>
              <GroupsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/tests/:testId/results"
        element={
          <ProtectedRoute>
            <Shell>
              <ResultsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route path="/test/:testId" element={<StudentEntryPage />} />
      <Route path="/test/:testId/session" element={<StudentTestPage />} />
    </Routes>
  );
}
