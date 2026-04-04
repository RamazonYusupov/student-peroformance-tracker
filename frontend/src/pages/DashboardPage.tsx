import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "../api";
import {
  DashboardGroupTrendResponse,
  DashboardSummary,
  GradeAnswerPayload,
  GroupEntity,
  SubmissionAnswerDetail,
  SubmissionDetail,
} from "../types";

type ReviewDecision = {
  is_correct?: boolean;
  feedback: string;
};

const MANUAL_TYPES = new Set(["short_answer", "paragraph"]);

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionDetail | null>(null);
  const [reviewMap, setReviewMap] = useState<Record<number, ReviewDecision>>({});
  const [grading, setGrading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [error, setError] = useState("");
  const [expandedPending, setExpandedPending] = useState(true);
  const [expandedRecent, setExpandedRecent] = useState(true);
  const [groups, setGroups] = useState<GroupEntity[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groupTrend, setGroupTrend] = useState<DashboardGroupTrendResponse | null>(null);

  const loadSummary = () => {
    api
      .getDashboardSummary()
      .then(setSummary)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    loadSummary();
    api
      .listGroups()
      .then(setGroups)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    api
      .getDashboardGroupTrends(selectedGroupId || undefined)
      .then((data: DashboardGroupTrendResponse) => setGroupTrend(data))
      .catch((e: Error) => setError(e.message));
  }, [selectedGroupId]);

  const trendChartData = useMemo(() => {
    if (!groupTrend) return [];
    return groupTrend.points.map((point) => ({
      ...point,
      date: new Date(point.date).toLocaleDateString(),
    }));
  }, [groupTrend]);

  const openPendingReview = async (submissionId: string) => {
    setReviewError("");
    try {
      const detail = (await api.getSubmission(submissionId)) as SubmissionDetail;
      setSelectedSubmission(detail);

      const initialMap: Record<number, ReviewDecision> = {};
      detail.answers
        .filter((a) => MANUAL_TYPES.has(a.question_type))
        .forEach((a) => {
          initialMap[a.question_id] = {
            is_correct: typeof a.is_correct === "boolean" ? a.is_correct : undefined,
            feedback: a.feedback || "",
          };
        });
      setReviewMap(initialMap);
    } catch (e) {
      setReviewError((e as Error).message);
    }
  };

  const closePendingReview = () => {
    setSelectedSubmission(null);
    setReviewMap({});
    setReviewError("");
  };

  const manualAnswers: SubmissionAnswerDetail[] = selectedSubmission
    ? selectedSubmission.answers.filter((a) => MANUAL_TYPES.has(a.question_type))
    : [];

  const canSubmitGrade =
    manualAnswers.length > 0 &&
    manualAnswers.every((answer) => typeof reviewMap[answer.question_id]?.is_correct === "boolean") &&
    !grading;

  const submitGrade = async () => {
    if (!selectedSubmission || !manualAnswers.length || !canSubmitGrade) return;

    const payload: { answers: GradeAnswerPayload[] } = {
      answers: manualAnswers.map((answer) => ({
        question_id: answer.question_id,
        is_correct: reviewMap[answer.question_id].is_correct,
        feedback: reviewMap[answer.question_id].feedback || null,
      })),
    };

    setGrading(true);
    setReviewError("");
    try {
      await api.gradeSubmission(selectedSubmission.submission_id, payload);
      closePendingReview();
      loadSummary();
    } catch (e) {
      setReviewError((e as Error).message);
    } finally {
      setGrading(false);
    }
  };

  if (error) return <div className="error">{error}</div>;
  if (!summary) return <div>Loading dashboard...</div>;

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="stat-grid">
        <div className="card stat"><h3>Total Tests</h3><span>{summary.total_tests}</span></div>
        <div className="card stat"><h3>Active Tests</h3><span>{summary.active_tests}</span></div>
        <div className="card stat"><h3>Total Submissions</h3><span>{summary.total_submissions}</span></div>
        <div className="card stat"><h3>Pending Grading</h3><span>{summary.pending_grading}</span></div>
      </div>

      <div className="card">
        <div className="chart-controls">
          <div>
            <h2 style={{ marginBottom: "6px" }}>Group Results Over Time</h2>
            <p className="muted-text" style={{ marginTop: 0 }}>
              View overall performance or filter by a specific group.
            </p>
          </div>
          <label style={{ minWidth: "260px" }}>
            Select Group
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              <option value="">All Groups</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={trendChartData}>
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
                name={groupTrend ? `${groupTrend.group_name} Avg %` : "Average %"}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {groupTrend && trendChartData.length === 0 && (
          <p className="muted-text">No submissions found for this group yet.</p>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Pending Grading</h2>
          <button
            onClick={() => setExpandedPending(!expandedPending)}
            style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            {expandedPending ? "▼ Hide" : "▶ Show"}
          </button>
        </div>
        {expandedPending && (
          <>
            {summary.recent_activity.filter((item) => item.status === "pending").length === 0 ? (
              <p className="muted-text">No pending submissions to grade.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Score</th>
                    <th>Submitted</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recent_activity
                    .filter((item) => item.status === "pending")
                    .map((item) => (
                      <tr key={item.submission_id}>
                        <td>{item.student_name}</td>
                        <td>
                          {item.score} / {item.total_points}
                        </td>
                        <td>{item.submitted_at ? new Date(item.submitted_at).toLocaleString() : "-"}</td>
                        <td>
                          <button onClick={() => openPendingReview(item.submission_id)}>
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Recent Activity</h2>
          <button
            onClick={() => setExpandedRecent(!expandedRecent)}
            style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            {expandedRecent ? "▼ Hide" : "▶ Show"}
          </button>
        </div>
        {expandedRecent && (
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Score</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {summary.recent_activity.filter((item) => item.status !== "pending").map((item) => (
                <tr key={item.submission_id}>
                  <td>{item.student_name}</td>
                  <td>
                    {item.score} / {item.total_points}
                  </td>
                  <td>{item.status}</td>
                  <td>{item.submitted_at ? new Date(item.submitted_at).toLocaleString() : "-"}</td>
                  <td>
                    {item.status === "pending" ? (
                      <button onClick={() => openPendingReview(item.submission_id)}>
                        Review
                      </button>
                    ) : (
                      <span className="muted-text">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedSubmission && (
        <div className="review-backdrop" onClick={closePendingReview}>
          <div className="review-panel card" onClick={(e) => e.stopPropagation()}>
            <div className="review-header">
              <h2>Review Pending Answers</h2>
              <button onClick={closePendingReview}>Close</button>
            </div>

            <p>
              Student: <strong>{selectedSubmission.student_name}</strong>
            </p>

            {reviewError && <div className="error">{reviewError}</div>}

            {!manualAnswers.length && (
              <p className="muted-text">No short-answer or paragraph responses found in this submission.</p>
            )}

            {manualAnswers.map((answer, idx) => (
              <div key={answer.question_id} className="review-question-box">
                <h3>
                  Question {idx + 1} ({answer.question_type.replace("_", " ")})
                </h3>
                <p><strong>Prompt:</strong> {answer.prompt}</p>
                <p><strong>Student answer:</strong> {answer.student_answer || "(empty)"}</p>

                <div className="inline-actions">
                  <button
                    className={reviewMap[answer.question_id]?.is_correct === true ? "decision-yes" : ""}
                    onClick={() =>
                      setReviewMap((prev) => ({
                        ...prev,
                        [answer.question_id]: {
                          feedback: prev[answer.question_id]?.feedback || "",
                          is_correct: true,
                        },
                      }))
                    }
                  >
                    Correct
                  </button>
                  <button
                    className={reviewMap[answer.question_id]?.is_correct === false ? "decision-no" : ""}
                    onClick={() =>
                      setReviewMap((prev) => ({
                        ...prev,
                        [answer.question_id]: {
                          feedback: prev[answer.question_id]?.feedback || "",
                          is_correct: false,
                        },
                      }))
                    }
                  >
                    Incorrect
                  </button>
                </div>

                <label>
                  Feedback (optional)
                  <textarea
                    rows={3}
                    value={reviewMap[answer.question_id]?.feedback || ""}
                    onChange={(e) =>
                      setReviewMap((prev) => ({
                        ...prev,
                        [answer.question_id]: {
                          is_correct: prev[answer.question_id]?.is_correct,
                          feedback: e.target.value,
                        },
                      }))
                    }
                  />
                </label>
              </div>
            ))}

            <div className="inline-actions">
              <button disabled={!canSubmitGrade} onClick={submitGrade}>
                {grading ? "Saving..." : "Save Review"}
              </button>
              {!canSubmitGrade && manualAnswers.length > 0 && (
                <span className="muted-text">Mark all answers as Correct or Incorrect first.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}