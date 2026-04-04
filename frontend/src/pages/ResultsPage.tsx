import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "../api";
import { AnalyticsOverview, GroupResultsPoint, SubmissionRow } from "../types";

export default function ResultsPage() {
  const { testId } = useParams();
  const [results, setResults] = useState<SubmissionRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!testId) return;
    Promise.all([api.getResults(testId), api.getAnalytics(testId)])
      .then(([rows, a]) => {
        setResults(rows);
        setAnalytics(a);
      })
      .catch((e: Error) => setError(e.message));
  }, [testId]);

  const chartData = useMemo(() => {
    if (!analytics) return [];
    return Object.entries(analytics.score_distribution).map(([range, count]) => ({
      range,
      count,
    }));
  }, [analytics]);

  const groupTrendData = useMemo(() => {
    if (!analytics) return [] as GroupResultsPoint[];
    return analytics.group_results_over_time.map((item) => ({
      ...item,
      date: new Date(item.date).toLocaleDateString(),
    }));
  }, [analytics]);

  return (
    <div>
      <h1>Results & Analytics</h1>
      {error && <div className="error">{error}</div>}

      {analytics && (
        <div className="stat-grid">
          <div className="card stat"><h3>Average Score</h3><span>{analytics.average_score}</span></div>
          <div className="card stat"><h3>Average %</h3><span>{analytics.average_percentage}%</span></div>
          <div className="card stat"><h3>Highest</h3><span>{analytics.highest_score}</span></div>
          <div className="card stat"><h3>Lowest</h3><span>{analytics.lowest_score}</span></div>
        </div>
      )}

      <div className="card">
        <h2>Score Distribution</h2>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#0f8b8d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2>Group Results Over Time</h2>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={groupTrendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="average_percentage"
                stroke="#f4a259"
                strokeWidth={3}
                dot={{ r: 4 }}
                name="Group Average %"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2>Submissions</h2>
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Score</th>
              <th>%</th>
              <th>Status</th>
              <th>Violations</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.submission_id}>
                <td>{r.student_name}</td>
                <td>{r.score} / {r.total_points}</td>
                <td>{r.percentage}</td>
                <td>{r.status}</td>
                <td>{r.violations}</td>
                <td>{r.time_taken_seconds ? `${Math.ceil(r.time_taken_seconds / 60)}m` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
