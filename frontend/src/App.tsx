import { ReactNode } from "react";
import { Link, Route, Routes } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import DashboardPage from "./pages/DashboardPage";
import GroupsPage from "./pages/GroupsPage";
import LoginPage from "./pages/LoginPage";
import ResultsPage from "./pages/ResultsPage";
import StudentEntryPage from "./pages/StudentEntryPage";
import StudentProfilePage from "./pages/StudentProfilePage";
import StudentTestPage from "./pages/StudentTestPage";
import TestsPage from "./pages/TestsPage";

function Shell({ children }: { children: ReactNode }) {
  const token = localStorage.getItem("teacher_token");

  return (
    <div className="app-shell">
      {token && (
        <aside className="sidebar">
          <h2>Teacher Hub</h2>
          <Link to="/">Dashboard</Link>
          <Link to="/tests">Tests</Link>
          <Link to="/groups">Groups</Link>
          <Link to="/students">Students</Link>
          <button
            onClick={() => {
              localStorage.removeItem("teacher_token");
              window.location.href = "/login";
            }}
          >
            Logout
          </button>
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

      <Route
        path="/students"
        element={
          <ProtectedRoute>
            <Shell>
              <StudentProfilePage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route path="/test/:testId" element={<StudentEntryPage />} />
      <Route path="/test/:testId/session" element={<StudentTestPage />} />
    </Routes>
  );
}
