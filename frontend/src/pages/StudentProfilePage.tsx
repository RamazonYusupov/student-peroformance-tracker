import { useEffect, useMemo, useState } from "react";

import { api } from "../api";
import type { StudentProfile, StudentProfileRow } from "../types";

const CHART_WIDTH = 860;
const CHART_HEIGHT = 280;
const PADDING = { top: 24, right: 28, bottom: 48, left: 48 };

function toTimestamp(value?: string | null) {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function normalizeSubject(subject?: string | null) {
  const trimmed = (subject || "").trim();
  return trimmed || "Uncategorized";
}

export default function StudentProfilePage() {
  const [students, setStudents] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listStudents()
      .then((names: string[]) => {
        setStudents(names);
        if (names.length) setSelected(names[0]);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    api
      .getStudentProfile(selected)
      .then((payload: StudentProfile) => {
        setProfile(payload);
      })
      .catch((e: Error) => setError(e.message));
  }, [selected]);

  const subjectOptions = useMemo(() => {
    if (!profile) return [] as string[];
    const subjects = new Set<string>();
    profile.history.forEach((row) => subjects.add(normalizeSubject(row.subject)));
    return Array.from(subjects).sort((a, b) => a.localeCompare(b));
  }, [profile]);

  useEffect(() => {
    if (!subjectOptions.length) {
      setSelectedSubject("");
      return;
    }

    if (!selectedSubject || !subjectOptions.includes(selectedSubject)) {
      setSelectedSubject(subjectOptions[0]);
    }
  }, [selectedSubject, subjectOptions]);

  const subjectHistory = useMemo(() => {
    if (!profile || !selectedSubject) return [] as StudentProfileRow[];
    return profile.history
      .filter((row) => normalizeSubject(row.subject) === selectedSubject)
      .slice()
      .sort((a, b) => toTimestamp(a.submitted_at) - toTimestamp(b.submitted_at));
  }, [profile, selectedSubject]);

  const chartData = useMemo(() => {
    const validRows = subjectHistory.filter((row) => Number.isFinite(toTimestamp(row.submitted_at)));
    if (!validRows.length) return null;

    const minTime = toTimestamp(validRows[0].submitted_at);
    const maxTime = toTimestamp(validRows[validRows.length - 1].submitted_at);
    const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
    const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

    const points = validRows.map((row, idx) => {
      const t = toTimestamp(row.submitted_at);
      const x =
        maxTime === minTime
          ? PADDING.left + plotWidth / 2
          : PADDING.left + ((t - minTime) / (maxTime - minTime)) * plotWidth;
      const y = PADDING.top + ((100 - row.percentage) / 100) * plotHeight;
      return {
        x,
        y,
        label: new Date(t).toLocaleDateString(),
        title: row.test_title,
        percentage: row.percentage,
        idx,
      };
    });

    const linePath = points
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");

    return { points, linePath };
  }, [subjectHistory]);

  const tableHistory = useMemo(() => {
    if (!profile) return [] as StudentProfileRow[];
    if (!selectedSubject) return profile.history;
    return profile.history.filter((row) => normalizeSubject(row.subject) === selectedSubject);
  }, [profile, selectedSubject]);

  return (
    <div>
      <h1>Student Profiles</h1>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <label>
          Select Student
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {students.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>

      {profile && (
        <>
          <div className="stat-grid">
            <div className="card stat"><h3>Total Tests</h3><span>{profile.total_tests_taken}</span></div>
            <div className="card stat"><h3>Average</h3><span>{profile.average_score}%</span></div>
            <div className="card stat"><h3>Pass Rate</h3><span>{profile.pass_rate}%</span></div>
            <div className="card stat"><h3>Violations</h3><span>{profile.total_violations}</span></div>
          </div>

          <div className="card">
            <div className="chart-controls">
              <h2>Results Over Time</h2>
              <label>
                Subject
                <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
                  {subjectOptions.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </label>
            </div>

            {!chartData && <p className="muted-text">No dated results available for this subject yet.</p>}

            {chartData && (
              <div className="line-chart-wrap">
                <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="line-chart" role="img" aria-label="Student result trend chart">
                  <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={CHART_HEIGHT - PADDING.bottom} className="axis-line" />
                  <line
                    x1={PADDING.left}
                    y1={CHART_HEIGHT - PADDING.bottom}
                    x2={CHART_WIDTH - PADDING.right}
                    y2={CHART_HEIGHT - PADDING.bottom}
                    className="axis-line"
                  />

                  {[0, 25, 50, 75, 100].map((tick) => {
                    const y = PADDING.top + ((100 - tick) / 100) * (CHART_HEIGHT - PADDING.top - PADDING.bottom);
                    return (
                      <g key={tick}>
                        <line
                          x1={PADDING.left}
                          y1={y}
                          x2={CHART_WIDTH - PADDING.right}
                          y2={y}
                          className="grid-line"
                        />
                        <text x={PADDING.left - 10} y={y + 4} textAnchor="end" className="axis-text">{tick}%</text>
                      </g>
                    );
                  })}

                  <path d={chartData.linePath} className="trend-line" />

                  {chartData.points.map((point) => (
                    <g key={`${point.idx}-${point.label}`}>
                      <circle cx={point.x} cy={point.y} r={5} className="trend-point" />
                      <title>{`${point.title} - ${point.percentage}% on ${point.label}`}</title>
                    </g>
                  ))}

                  {chartData.points.map((point, idx) => {
                    if (idx % 2 !== 0 && idx !== chartData.points.length - 1) return null;
                    return (
                      <text key={`label-${point.idx}`} x={point.x} y={CHART_HEIGHT - 16} textAnchor="middle" className="axis-text">
                        {point.label}
                      </text>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>

          <div className="card">
            <h2>History {selectedSubject ? `- ${selectedSubject}` : ""}</h2>
            <table>
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Subject</th>
                  <th>%</th>
                  <th>Status</th>
                  <th>Violations</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {tableHistory.map((item) => (
                  <tr key={`${item.test_id}-${item.submitted_at}`}>
                    <td>{item.test_title}</td>
                    <td>{item.subject || "-"}</td>
                    <td>{item.percentage}</td>
                    <td>{item.status}</td>
                    <td>{item.violations}</td>
                    <td>{item.submitted_at ? new Date(item.submitted_at).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
