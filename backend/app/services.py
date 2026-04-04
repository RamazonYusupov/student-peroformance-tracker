import secrets
from datetime import datetime, timezone

from app.models import Question, QuestionType, Submission, SubmissionStatus, Test


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def test_status(test: Test) -> str:
    now = now_utc()
    if now < _to_aware(test.start_at):
        return "scheduled"
    if now > _to_aware(test.end_at):
        return "expired"
    return "active"


def build_time_gate_message(test: Test) -> tuple[bool, str]:
    status = test_status(test)
    if status == "scheduled":
        return False, f"This test has not started yet. It opens on {test.start_at.isoformat()}."
    if status == "expired":
        return False, "This test is now closed."
    return True, "Test is active. You can start now."


def grade_auto(question: Question, answer_text: str | None) -> tuple[bool | None, float | None]:
    if question.question_type in (QuestionType.SHORT_ANSWER, QuestionType.PARAGRAPH):
        return None, None

    normalized_answer = (answer_text or "").strip().lower()
    normalized_correct = (question.correct_answer or "").strip().lower()
    is_correct = normalized_answer == normalized_correct
    awarded_points = float(question.points if is_correct else 0)
    return is_correct, awarded_points


def evaluate_submission(submission: Submission, test: Test) -> tuple[float, float, SubmissionStatus]:
    total_points = float(sum(q.points for q in test.questions)) or 1.0
    score = 0.0
    has_pending_manual_review = False
    question_type_by_id = {q.id: q.question_type for q in test.questions}

    for answer in submission.answers:
        if answer.awarded_points is not None:
            score += answer.awarded_points
        question_type = question_type_by_id.get(answer.question_id)
        if (
            question_type in (QuestionType.SHORT_ANSWER, QuestionType.PARAGRAPH)
            and answer.awarded_points is None
        ):
            has_pending_manual_review = True

    percentage = round((score / total_points) * 100, 2)

    if submission.force_fail or submission.violations >= 3:
        return score, percentage, SubmissionStatus.FAIL
    if has_pending_manual_review:
        return score, percentage, SubmissionStatus.PENDING
    if percentage >= test.passing_score:
        return score, percentage, SubmissionStatus.PASS
    return score, percentage, SubmissionStatus.FAIL


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def _to_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value
