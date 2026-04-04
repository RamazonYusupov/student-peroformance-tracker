import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../api";

export default function StudentEntryPage() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!testId) return;
    api
      .getEntry(testId)
      .then(setEntry)
      .catch((e: Error) => setError(e.message));
  }, [testId]);

  const onStart = async (event: FormEvent) => {
    event.preventDefault();
    if (!testId) return;
    setError("");
    try {
      const session = await api.startTest(testId, fullName, studentId);
      session.end_at = entry.end_at;
      localStorage.setItem(`session_${testId}`, JSON.stringify(session));
      navigate(`/test/${testId}/session`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (error && !entry) {
    return (
      <div className="center-screen test-entry-bg">
        <div className="card entry-card">
          <div className="error">{error}</div>
        </div>
      </div>
    );
  }

  if (!entry) return <div className="center-screen">Loading...</div>;

  const assignedGroups = (entry.group_names || []).filter(Boolean);

  return (
    <div className="center-screen test-entry-bg">
      <div className="card entry-card">
        <h1>{entry.title}</h1>
        <p>{entry.description || "No description provided."}</p>
        {assignedGroups.length > 0 && (
          <p><strong>Assigned Groups:</strong> {assignedGroups.join(", ")}</p>
        )}
        {!entry.is_access_allowed ? (
          <div className="error">{entry.message}</div>
        ) : (
          <form onSubmit={onStart} className="stack">
            <label>Full Name<input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
            <label>Student ID (Optional)<input value={studentId} onChange={(e) => setStudentId(e.target.value)} /></label>
            {error && <div className="error">{error}</div>}
            <button type="submit">Start Test</button>
          </form>
        )}
      </div>
    </div>
  );
}
