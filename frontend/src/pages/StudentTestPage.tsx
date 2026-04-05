import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../api";

type NavigatorWithKeyboardLock = Navigator & {
  keyboard?: {
    lock?: (keyCodes?: string[]) => Promise<void>;
    unlock?: () => void;
  };
};

const WARNING_LIMIT = 3;
const VIOLATION_DEBOUNCE_MS = 1000;

function parseServerDateToMs(value: string | null | undefined) {
  if (!value) return Number.NaN;
  const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
  const normalized = hasTimezone ? value : `${value}Z`;
  return new Date(normalized).getTime();
}

function getRemainingSeconds(endAt: string | null | undefined) {
  if (!endAt) return 0;
  const endTime = parseServerDateToMs(endAt);
  if (Number.isNaN(endTime)) return 0;
  return Math.max(0, Math.floor((endTime - Date.now()) / 1000));
}

export default function StudentTestPage() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [violations, setViolations] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [warning, setWarning] = useState("");
  const [isFullscreenLost, setIsFullscreenLost] = useState(false);
  const [penalizedQuestionIds, setPenalizedQuestionIds] = useState<Set<number>>(new Set());
  const submittingRef = useRef(false);
  const hadFullscreenRef = useRef(false);
  const violationsRef = useRef(0);
  const lastOverlayTapRef = useRef(0);
  const penalizedQuestionIdsRef = useRef<Set<number>>(new Set());
  const currentQuestionIdRef = useRef<number | null>(null);
  const lastViolationAtRef = useRef(0);

  const registerViolation = (reason: string, isFullscreenViolation = false) => {
    if (submittingRef.current) return;
    const now = Date.now();
    if (now - lastViolationAtRef.current < VIOLATION_DEBOUNCE_MS) return;
    lastViolationAtRef.current = now;

    const next = Math.min(WARNING_LIMIT, violationsRef.current + 1);
    violationsRef.current = next;
    setViolations(next);

    const currentQuestionId = currentQuestionIdRef.current;
    if (currentQuestionId !== null && !penalizedQuestionIdsRef.current.has(currentQuestionId)) {
      const nextPenalized = new Set(penalizedQuestionIdsRef.current);
      nextPenalized.add(currentQuestionId);
      penalizedQuestionIdsRef.current = nextPenalized;
      setPenalizedQuestionIds(nextPenalized);

      // Keep the answer blank locally; backend enforces zero points for penalized questions.
      setAnswers((prev) => ({ ...prev, [currentQuestionId]: "" }));
    }

    setIndex((previousIndex) => {
      const totalQuestions = session?.questions?.length ?? 0;
      if (totalQuestions === 0) return previousIndex;
      return Math.min(previousIndex + 1, totalQuestions - 1);
    });

    const optionsLeft = Math.max(0, WARNING_LIMIT - next);
    setWarning(
      `${reason}. 1 attempt deducted. Current question marked incorrect. ${optionsLeft} attempt${optionsLeft === 1 ? "" : "s"} left.`
    );

    if (next >= WARNING_LIMIT) {
      submitNow(false, true, next).catch(() => undefined);
    }
  };

  const requestFullscreenFromOverlay = async () => {
    if (submittingRef.current || document.fullscreenElement) return;
    try {
      await document.documentElement.requestFullscreen();
      await (navigator as NavigatorWithKeyboardLock).keyboard?.lock?.(["Escape"]);
      setWarning("");
      setIsFullscreenLost(false);
    } catch {
      setWarning("Fullscreen is required. Double-tap/click the red overlay to retry.");
    }
  };

  useEffect(() => {
    if (!testId) return;
    const raw = localStorage.getItem(`session_${testId}`);
    if (!raw) {
      navigate(`/test/${testId}`);
      return;
    }
    const parsed = JSON.parse(raw);
    setSession(parsed);
    setViolations(0);
    setPenalizedQuestionIds(new Set());
    violationsRef.current = 0;
    penalizedQuestionIdsRef.current = new Set();
    currentQuestionIdRef.current = null;
    lastViolationAtRef.current = 0;
    setSecondsLeft(getRemainingSeconds(parsed.end_at));
  }, [navigate, testId]);

  useEffect(() => {
    if (!session) return;

    const tick = () => {
      const remaining = getRemainingSeconds(session.end_at);
      setSecondsLeft(remaining);
      if (remaining <= 0 && !submittingRef.current) {
        submittingRef.current = true;
        submitNow(true).finally(() => {
          submittingRef.current = false;
        });
      }
    };

    tick();
    const timer = setInterval(() => {
      tick();
    }, 1000);

    return () => clearInterval(timer);
  }, [session]);

  useEffect(() => {
    const requestFullscreen = async () => {
      if (!document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
          hadFullscreenRef.current = true;
          await (navigator as NavigatorWithKeyboardLock).keyboard?.lock?.(["Escape"]);
          setWarning("");
          setIsFullscreenLost(false);
        } catch {
          setWarning("Fullscreen is required for this test.");
        }
      } else {
        hadFullscreenRef.current = true;
        await (navigator as NavigatorWithKeyboardLock).keyboard?.lock?.(["Escape"]);
        setIsFullscreenLost(false);
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        registerViolation("Screen switch detected", true);
      }
    };

    const onFullscreen = () => {
      if (document.fullscreenElement) {
        hadFullscreenRef.current = true;
        (navigator as NavigatorWithKeyboardLock).keyboard?.lock?.(["Escape"]).catch(() => undefined);
        setWarning("");
        setIsFullscreenLost(false);
        return;
      }

      (navigator as NavigatorWithKeyboardLock).keyboard?.unlock?.();
      setIsFullscreenLost(true);

      if (!submittingRef.current && hadFullscreenRef.current) {
        registerViolation("Exited fullscreen", true);
      }
    };

    const onContext = (event: MouseEvent) => event.preventDefault();

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (event.key === "F11") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      if (event.altKey && key === "tab") {
        event.preventDefault();
        registerViolation("Alt+Tab screen switch detected", true);
        return;
      }

      const isClipboardShortcut =
        ((event.ctrlKey || event.metaKey) && ["c", "v", "x", "insert"].includes(key)) ||
        (event.shiftKey && key === "insert");

      if (isClipboardShortcut) {
        event.preventDefault();
      }
    };

    const onBlur = () => {
      if (!submittingRef.current) {
        registerViolation("Window focus lost", true);
      }
    };

    const onCopyCutPaste = (event: ClipboardEvent) => {
      event.preventDefault();
    };

    const onDrop = (event: DragEvent) => {
      event.preventDefault();
    };

    requestFullscreen();
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("contextmenu", onContext);
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("copy", onCopyCutPaste);
    document.addEventListener("cut", onCopyCutPaste);
    document.addEventListener("paste", onCopyCutPaste);
    document.addEventListener("drop", onDrop);
    window.addEventListener("blur", onBlur);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("copy", onCopyCutPaste);
      document.removeEventListener("cut", onCopyCutPaste);
      document.removeEventListener("paste", onCopyCutPaste);
      document.removeEventListener("drop", onDrop);
      window.removeEventListener("blur", onBlur);
      (navigator as NavigatorWithKeyboardLock).keyboard?.unlock?.();
    };
  }, [session]);

  const currentQuestion = useMemo(() => {
    if (!session) return null;
    return session.questions[index];
  }, [session, index]);

  useEffect(() => {
    currentQuestionIdRef.current = currentQuestion?.id ?? null;
  }, [currentQuestion]);

  const isCurrentQuestionPenalized = currentQuestion ? penalizedQuestionIds.has(currentQuestion.id) : false;

  const submitNow = async (timeExpired = false, forcedFail = false, forceViolations?: number) => {
    if (!session || !testId || submittingRef.current) return;
    submittingRef.current = true;

    const payload = {
      session_token: session.session_token,
      violations: forceViolations ?? violationsRef.current,
      forced_fail: forcedFail,
      penalized_question_ids: Array.from(penalizedQuestionIdsRef.current),
      answers: session.questions.map((q: any) => ({
        question_id: q.id,
        answer_text: answers[q.id] || "",
      })),
    };

    try {
      const response = await api.submitTest(testId, payload);
      localStorage.removeItem(`session_${testId}`);
      alert(timeExpired ? "Time is up. Answers were auto-submitted." : response.message);
      navigate(`/test/${testId}`);
    } catch (error) {
      setWarning((error as Error).message || "Unable to submit test. Please try again.");
      submittingRef.current = false;
    }
  };

  if (!session || !currentQuestion) return <div className="center-screen">Loading session...</div>;

  const onOverlayTouchStart = () => {
    const now = Date.now();
    if (now - lastOverlayTapRef.current < 350) {
      requestFullscreenFromOverlay().catch(() => undefined);
      lastOverlayTapRef.current = 0;
      return;
    }
    lastOverlayTapRef.current = now;
  };

  return (
    <div className="test-shell" style={{ position: "relative" }}>
      {isFullscreenLost && (
        <div
          onDoubleClick={() => requestFullscreenFromOverlay().catch(() => undefined)}
          onTouchStart={onOverlayTouchStart}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.95)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              textAlign: "center",
              color: "white",
              fontSize: "24px",
              fontWeight: "bold",
              padding: "40px",
              backgroundColor: "rgba(200, 0, 0, 0.8)",
              borderRadius: "10px",
              maxWidth: "600px",
            }}
          >
            <h1>⚠️ FULLSCREEN VIOLATION</h1>
            <p>The test must be taken in fullscreen mode.</p>
            <p>You have {Math.max(0, WARNING_LIMIT - violations)} attempt{Math.max(0, WARNING_LIMIT - violations) === 1 ? "" : "s"} remaining.</p>
            <p>Double-tap/click this red area to return to fullscreen.</p>
          </div>
        </div>
      )}
      <div style={{ pointerEvents: isFullscreenLost ? "none" : "auto", opacity: isFullscreenLost ? 0.5 : 1 }}>
      <header>
        <h2>{session.title}</h2>
        <div className={secondsLeft < 300 ? "timer danger" : "timer"}>
          Time Left: {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
        </div>
        <div>Warnings: {violations} / {WARNING_LIMIT}</div>
        <div>Attempts left: {Math.max(0, WARNING_LIMIT - violations)} / {WARNING_LIMIT}</div>
      </header>

      {warning && <div className="warning-overlay">{warning}</div>}

      <section className="card">
        <h3>
          Question {index + 1} of {session.questions.length}
        </h3>
        <p>{currentQuestion.prompt}</p>

        {(currentQuestion.question_type === "multiple_choice" || currentQuestion.question_type === "true_false") && (
          <div className="stack">
            {(currentQuestion.options || []).map((opt: string) => (
              <label key={opt} className="option-row">
                <input
                  type="radio"
                  name={`q_${currentQuestion.id}`}
                  checked={answers[currentQuestion.id] === opt}
                  disabled={isCurrentQuestionPenalized}
                  onChange={() => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: opt }))}
                />
                {opt}
              </label>
            ))}
          </div>
        )}

        {(currentQuestion.question_type === "short_answer" || currentQuestion.question_type === "paragraph") && (
          <textarea
            value={answers[currentQuestion.id] || ""}
            disabled={isCurrentQuestionPenalized}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: e.target.value }))}
            rows={currentQuestion.question_type === "paragraph" ? 8 : 3}
          />
        )}

        {isCurrentQuestionPenalized && (
          <p className="danger-text">This question was marked incorrect due to a screen-switch violation and cannot be changed.</p>
        )}

        <div className="inline-actions">
          {index > 0 && <button onClick={() => setIndex((p) => p - 1)}>Previous</button>}
          {index < session.questions.length - 1 && (
            <button onClick={() => setIndex((p) => p + 1)}>Next</button>
          )}
          {index === session.questions.length - 1 && (
            <button disabled={submittingRef.current} onClick={() => submitNow(false, false)}>
              {submittingRef.current ? "Submitting..." : "Submit Test"}
            </button>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}
