import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { GroupEntity, Question, QuestionType, TestEntity } from "../types";

function defaultQuestion(index: number): Question {
  return {
    question_type: "multiple_choice",
    prompt: "",
    options: ["", "", "", ""],
    correct_answer: "",
    points: 1,
    order_index: index,
  };
}

export default function TestsPage() {
  const [tests, setTests] = useState<TestEntity[]>([]);
  const [groups, setGroups] = useState<GroupEntity[]>([]);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [passingScore, setPassingScore] = useState(60);
  const [randomize, setRandomize] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([defaultQuestion(0)]);
  const [error, setError] = useState("");

  const loadTests = () => {
    api
      .listTests()
      .then(setTests)
      .catch((e: Error) => setError(e.message));
  };

  const loadGroups = () => {
    api
      .listGroups()
      .then(setGroups)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    loadTests();
    loadGroups();
  }, []);

  const resetForm = () => {
    setEditingTestId(null);
    setTitle("");
    setDescription("");
    setSubject("");
    setGroupIds([]);
    setStartAt("");
    setEndAt("");
    setPassingScore(60);
    setRandomize(false);
    setQuestions([defaultQuestion(0)]);
  };

  const toDateTimeLocalValue = (isoDate: string) => {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return "";
    const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
  };

  const toFormQuestion = (question: Question, index: number): Question => {
    if (question.question_type === "multiple_choice") {
      const source = question.options || [];
      return {
        ...question,
        options: [source[0] || "", source[1] || "", source[2] || "", source[3] || ""],
        correct_answer: question.correct_answer || "",
        order_index: index,
      };
    }
    if (question.question_type === "true_false") {
      return {
        ...question,
        options: ["True", "False"],
        correct_answer: question.correct_answer || "True",
        order_index: index,
      };
    }
    return {
      ...question,
      options: null,
      correct_answer: question.correct_answer || null,
      order_index: index,
    };
  };

  const onEdit = async (testId: string) => {
    setError("");
    try {
      const test = (await api.getTest(testId)) as TestEntity;
      setEditingTestId(test.id);
      setTitle(test.title || "");
      setDescription(test.description || "");
      setSubject(test.subject || "");
      setGroupIds(
        (test.group_ids && test.group_ids.length > 0)
          ? test.group_ids
          : (test.group_id ? [test.group_id] : []),
      );
      setStartAt(toDateTimeLocalValue(test.start_at));
      setEndAt(toDateTimeLocalValue(test.end_at));
      setPassingScore(test.passing_score ?? 60);
      setRandomize(Boolean(test.randomize_question_order));
      setQuestions(
        (test.questions || []).length > 0
          ? (test.questions || []).map((question, index) => toFormQuestion(question, index))
          : [defaultQuestion(0)],
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const updateQuestion = (index: number, next: Partial<Question>) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...next, order_index: i } : q)),
    );
  };

  const onTypeChange = (index: number, questionType: QuestionType) => {
    const base: Partial<Question> = { question_type: questionType, options: null, correct_answer: null };
    if (questionType === "multiple_choice") {
      base.options = ["", "", "", ""];
      base.correct_answer = "";
    }
    if (questionType === "true_false") {
      base.options = ["True", "False"];
      base.correct_answer = "True";
    }
    updateQuestion(index, base);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const payload = {
        title,
        description,
        subject,
        group_id: groupIds[0] || null,
        group_ids: groupIds,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        passing_score: passingScore,
        randomize_question_order: randomize,
        questions: questions.map((q) => ({
          ...q,
          options: q.options?.map((option) => option.trim()) || null,
          correct_answer: q.correct_answer?.trim() || null,
        })),
      };

      if (editingTestId) {
        await api.updateTest(editingTestId, payload);
      } else {
        await api.createTest(payload);
      }

      resetForm();
      loadTests();
      loadGroups();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <h1>Tests</h1>
      {error && <div className="error">{error}</div>}

      <section className="card">
        <h2>{editingTestId ? "Update Test" : "Create Test"}</h2>
        <form onSubmit={onSubmit} className="test-form-layout">
          <div className="test-settings-panel">
            <h3>Test Settings</h3>
            <div className="stack">
              <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
              <label>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: "80px" }} /></label>
              <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
              <label>
                Assigned Groups
                <div className="card" style={{ marginBottom: 0, marginTop: "6px" }}>
                  <label className="checkbox-label" style={{ marginBottom: "6px" }}>
                    <input
                      type="checkbox"
                      checked={groupIds.length === 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setGroupIds([]);
                        }
                      }}
                    />
                    No group restriction (all students)
                  </label>
                  {groups.map((group) => (
                    <label key={group.id} className="checkbox-label" style={{ marginBottom: "6px" }}>
                      <input
                        type="checkbox"
                        checked={groupIds.includes(group.id)}
                        onChange={(e) => {
                          setGroupIds((prev) => {
                            if (e.target.checked) {
                              return [...prev, group.id];
                            }
                            return prev.filter((id) => id !== group.id);
                          });
                        }}
                      />
                      {group.name}
                    </label>
                  ))}
                  {groups.length === 0 && (
                    <p className="muted-text" style={{ margin: 0 }}>
                      No groups found. Create groups in the Groups section.
                    </p>
                  )}
                </div>
              </label>
              <label>Start At<input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required /></label>
              <label>End At<input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required /></label>
              <label>Passing Score %<input type="number" value={passingScore} onChange={(e) => setPassingScore(Number(e.target.value))} min={0} max={100} /></label>
              <label className="checkbox-label">
                <input type="checkbox" checked={randomize} onChange={(e) => setRandomize(e.target.checked)} />
                Randomize Question Order
              </label>
            </div>
          </div>

          <div className="questions-panel">
            <h3>Questions ({questions.length})</h3>
            <div className="questions-container">
              {questions.map((q, index) => (
                <div key={index} className="question-box">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <strong>Question {index + 1}</strong>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== index))}
                        style={{ padding: "4px 8px", fontSize: "12px", background: "var(--danger)" }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <label>
                    Type
                    <select value={q.question_type} onChange={(e) => onTypeChange(index, e.target.value as QuestionType)}>
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="true_false">True / False</option>
                      <option value="short_answer">Short Answer</option>
                      <option value="paragraph">Paragraph</option>
                    </select>
                  </label>
                  <label>Prompt<textarea value={q.prompt} onChange={(e) => updateQuestion(index, { prompt: e.target.value })} required /></label>
                  <label>Points<input type="number" value={q.points} onChange={(e) => updateQuestion(index, { points: Number(e.target.value) })} min={1} /></label>
                  {(q.question_type === "multiple_choice" || q.question_type === "true_false") && (
                    <>
                      {q.question_type === "multiple_choice" && (
                        <div className="stack">
                          <label>
                            Option A
                            <input
                              value={q.options?.[0] || ""}
                              onChange={(e) => {
                                const nextOptions = [...(q.options || ["", "", "", ""])];
                                nextOptions[0] = e.target.value;
                                updateQuestion(index, { options: nextOptions });
                              }}
                              required
                            />
                          </label>
                          <label>
                            Option B
                            <input
                              value={q.options?.[1] || ""}
                              onChange={(e) => {
                                const nextOptions = [...(q.options || ["", "", "", ""])];
                                nextOptions[1] = e.target.value;
                                updateQuestion(index, { options: nextOptions });
                              }}
                              required
                            />
                          </label>
                          <label>
                            Option C
                            <input
                              value={q.options?.[2] || ""}
                              onChange={(e) => {
                                const nextOptions = [...(q.options || ["", "", "", ""])];
                                nextOptions[2] = e.target.value;
                                updateQuestion(index, { options: nextOptions });
                              }}
                              required
                            />
                          </label>
                          <label>
                            Option D
                            <input
                              value={q.options?.[3] || ""}
                              onChange={(e) => {
                                const nextOptions = [...(q.options || ["", "", "", ""])];
                                nextOptions[3] = e.target.value;
                                updateQuestion(index, { options: nextOptions });
                              }}
                              required
                            />
                          </label>
                        </div>
                      )}
                      <label>
                        Correct Answer
                        <select
                          value={q.correct_answer || ""}
                          onChange={(e) => updateQuestion(index, { correct_answer: e.target.value })}
                          required
                        >
                          <option value="" disabled>Select correct answer</option>
                          {(q.options || []).map((option, optionIndex) => (
                            <option key={optionIndex} value={option}>
                              {option || `Option ${String.fromCharCode(65 + optionIndex)}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setQuestions((prev) => [...prev, defaultQuestion(prev.length)]) } style={{ width: "100%" }}>
              + Add Question
            </button>
          </div>
        </form>
        
        <div className="form-actions">
          {editingTestId && (
            <button type="button" onClick={resetForm} style={{ background: "var(--muted)" }}>
              Cancel Edit
            </button>
          )}
          <button type="submit" onClick={onSubmit}>{editingTestId ? "Update Test" : "Save Test"}</button>
        </div>
      </section>

      <section className="card">
        <h2>All Tests</h2>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Subject</th>
              <th>Group</th>
              <th>Status</th>
              <th>Submissions</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((test: any) => (
              <tr key={test.id}>
                <td>{test.title}</td>
                <td>{test.subject || "-"}</td>
                <td>{(test.group_names && test.group_names.length > 0) ? test.group_names.join(", ") : (test.group_name || "All")}</td>
                <td>{test.status}</td>
                <td>{test.submission_count}</td>
                <td className="inline-actions">
                  <Link to={`/tests/${test.id}/results`}>Results</Link>
                  <a href={`/test/${test.id}`} target="_blank" rel="noreferrer">Student Link</a>
                  <button onClick={() => onEdit(test.id)}>Edit</button>
                  <button
                    onClick={async () => {
                      await api.deleteTest(test.id);
                      loadTests();
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
