import { ReactNode } from "react";
import { NavLink, Route, Routes } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import DashboardPage from "./pages/DashboardPage";
import GroupsPage from "./pages/GroupsPage";
import LoginPage from "./pages/LoginPage";
import ResultsPage from "./pages/ResultsPage";
import StudentEntryPage from "./pages/StudentEntryPage";
import StudentTestPage from "./pages/StudentTestPage";
import TestsPage from "./pages/TestsPage";

function Shell({ children }: { children: ReactNode }) {
  const token = localStorage.getItem("teacher_token");
  const navItems = [
    { to: "/", label: "Dashboard" },
    { to: "/tests", label: "Tests" },
    { to: "/groups", label: "Groups" },
  ];

  return (
    <div className="app-shell">
      {token && (
        <aside className="sidebar">
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
            <button
              onClick={() => {
                localStorage.removeItem("teacher_token");
                window.location.href = "/login";
              }}
            >
              Logout
            </button>
          </div>
        </aside>
      )}
      <main className="main-content">{children}</main>
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
