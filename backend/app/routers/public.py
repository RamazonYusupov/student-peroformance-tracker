import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Answer, Group, Question, QuestionType, Submission, Test
from app.schemas import (
    StudentEntryResponse,
    StudentQuestionRead,
    StudentStartRequest,
    StudentStartResponse,
    StudentSubmitRequest,
    StudentSubmitResponse,
)
from app.services import (
    build_time_gate_message,
    evaluate_submission,
    generate_session_token,
    grade_auto,
    now_utc,
)

router = APIRouter(prefix="/api/public/tests", tags=["student"])


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.strip().split())


def _assigned_group_ids(test: Test) -> list[str]:
    group_ids: list[str] = []
    seen: set[str] = set()
    for raw in [*(test.group_ids or []), test.group_id]:
        candidate = (raw or "").strip()
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        group_ids.append(candidate)
    return group_ids


def _eligible_groups_for_test(test: Test, db: Session) -> tuple[list[Group], bool]:
    assigned_group_ids = _assigned_group_ids(test)
    if assigned_group_ids:
        groups = db.scalars(select(Group).where(
            Group.id.in_(assigned_group_ids))).all()
        return groups, True

    # "Created for everyone" means all groups in the system, not anonymous users.
    groups = db.scalars(select(Group)).all()
    return groups, False


def _is_group_member(assigned_groups: list[Group], student_name: str, student_id: str) -> bool:
    if not assigned_groups:
        return False

    normalized_name = _normalize_text(student_name)
    normalized_id = _normalize_text(student_id)

    if not normalized_name or not normalized_id:
        return False

    for group in assigned_groups:
        for entry in (group.students or []):
            if isinstance(entry, dict):
                full_name = _normalize_text(entry.get("full_name"))
                student_id_value = _normalize_text(entry.get("student_id"))
                if full_name and student_id_value:
                    if normalized_name == full_name and normalized_id == student_id_value:
                        return True
            elif isinstance(entry, str):
                # Backward compatibility for existing string-based group entries.
                value = _normalize_text(entry)
                if value and normalized_name == value and normalized_id == value:
                    return True

    return False


@router.get("/{test_id}/entry", response_model=StudentEntryResponse)
def get_test_entry(test_id: str, db: Session = Depends(get_db)):
    test = db.scalar(
        select(Test)
        .options(joinedload(Test.group))
        .where(Test.id == test_id)
    )
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    assigned_group_ids = _assigned_group_ids(test)
    assigned_groups, has_explicit_assignments = _eligible_groups_for_test(
        test, db)
    assigned_group_names = [group.name for group in assigned_groups]

    is_allowed, message = build_time_gate_message(test)
    if has_explicit_assignments and assigned_group_ids and not assigned_groups:
        is_allowed = False
        message = "This test has invalid or missing group assignments. Please contact your teacher."
    elif not has_explicit_assignments and not assigned_groups:
        is_allowed = False
        message = "No groups are configured yet. Ask your teacher to create groups and add students first."

    restriction_suffix = (
        f" Only students in these groups can start this test: {', '.join(assigned_group_names)}."
        if has_explicit_assignments and assigned_group_names
        else " Only students listed in a group roster can start this test."
    )
    return StudentEntryResponse(
        test_id=test.id,
        title=test.title,
        description=test.description,
        group_name=assigned_group_names[0] if assigned_group_names else None,
        group_names=assigned_group_names,
        start_at=test.start_at,
        end_at=test.end_at,
        message=f"{message}{restriction_suffix}",
        is_access_allowed=is_allowed,
    )


@router.post("/{test_id}/start", response_model=StudentStartResponse)
def start_test(
    test_id: str,
    payload: StudentStartRequest,
    db: Session = Depends(get_db),
):
    test = db.scalar(
        select(Test)
        .options(joinedload(Test.questions), joinedload(Test.group))
        .where(Test.id == test_id)
    )
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    assigned_group_ids = _assigned_group_ids(test)
    assigned_groups, has_explicit_assignments = _eligible_groups_for_test(
        test, db)
    assigned_group_names = [group.name for group in assigned_groups]

    if has_explicit_assignments and assigned_group_ids and not assigned_groups:
        raise HTTPException(
            status_code=400,
            detail="This test has invalid or missing group assignments. Please contact your teacher.",
        )

    if not has_explicit_assignments and not assigned_groups:
        raise HTTPException(
            status_code=400,
            detail="No groups are configured yet. Ask your teacher to create groups and add students first.",
        )

    is_allowed, message = build_time_gate_message(test)
    if not is_allowed:
        raise HTTPException(status_code=400, detail=message)

    incoming_name = payload.full_name.strip()
    incoming_student_id = payload.student_id.strip()
    normalized_name = _normalize_text(incoming_name)
    normalized_id = _normalize_text(incoming_student_id)

    if not normalized_name or not normalized_id:
        raise HTTPException(
            status_code=400,
            detail="Full name and student ID are required.",
        )

    if not _is_group_member(assigned_groups, incoming_name, incoming_student_id):
        if has_explicit_assignments:
            detail = (
                "This test is restricted to assigned group students. "
                f"Allowed groups: {', '.join(assigned_group_names)}. "
                "Enter the exact full name and student ID from the assigned group roster."
            )
        else:
            detail = (
                "This test is open to all groups, but only registered students can start. "
                "Enter the exact full name and student ID from any group roster."
            )
        raise HTTPException(status_code=403, detail=detail)

    if test.subject:
        subject_submissions = db.scalars(
            select(Submission)
            .join(Test, Submission.test_id == Test.id)
            .where(
                Test.subject == test.subject,
                Submission.submitted_at.is_not(None),
            )
        ).all()

        duplicate_submission = None
        for sub in subject_submissions:
            existing_student_id = _normalize_text(sub.student_id)
            existing_name = _normalize_text(sub.student_name)

            if existing_student_id and existing_student_id == normalized_id:
                duplicate_submission = sub
                break
            if not existing_student_id and existing_name and existing_name == normalized_name:
                duplicate_submission = sub
                break

        if duplicate_submission:
            raise HTTPException(
                status_code=400,
                detail=(
                    "You have already submitted a test in this subject. Retakes are not allowed."
                ),
            )

    session_token = generate_session_token()
    submission = Submission(
        test_id=test.id,
        student_name=incoming_name,
        student_id=incoming_student_id,
        session_token=session_token,
        started_at=now_utc(),
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    questions = list(test.questions)
    if test.randomize_question_order:
        random.shuffle(questions)

    safe_questions = [
        StudentQuestionRead(
            id=q.id,
            question_type=q.question_type,
            prompt=q.prompt,
            options=q.options,
            points=q.points,
        )
        for q in questions
    ]

    return StudentStartResponse(
        submission_id=submission.id,
        session_token=session_token,
        test_id=test.id,
        title=test.title,
        end_at=test.end_at,
        student_name=submission.student_name,
        questions=safe_questions,
    )


@router.post("/{test_id}/submit", response_model=StudentSubmitResponse)
def submit_test(
    test_id: str,
    payload: StudentSubmitRequest,
    db: Session = Depends(get_db),
):
    submission = db.scalar(
        select(Submission)
        .options(
            joinedload(Submission.answers),
            joinedload(Submission.test).joinedload(Test.questions),
        )
        .where(
            Submission.test_id == test_id,
            Submission.session_token == payload.session_token,
        )
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if submission.submitted_at:
        raise HTTPException(
            status_code=400, detail="Submission already completed")

    test = submission.test

    answer_map = {a.question_id: a for a in payload.answers}
    existing = {a.question_id: a for a in submission.answers}

    for question in test.questions:
        incoming = answer_map.get(question.id)
        answer_text = incoming.answer_text if incoming else None
        is_correct, awarded_points = grade_auto(question, answer_text)
        if question.question_type in (QuestionType.SHORT_ANSWER, QuestionType.PARAGRAPH):
            is_correct, awarded_points = None, None

        entity = existing.get(question.id)
        if not entity:
            entity = Answer(submission_id=submission.id,
                            question_id=question.id)
            db.add(entity)

        entity.answer_text = answer_text
        entity.is_correct = is_correct
        entity.awarded_points = awarded_points

    submission.violations = payload.violations
    submission.force_fail = payload.forced_fail or payload.violations >= 3
    submission.submitted_at = now_utc()

    started_at = submission.started_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=submission.submitted_at.tzinfo)

    submitted_at = submission.submitted_at
    if submitted_at.tzinfo is None:
        submitted_at = submitted_at.replace(tzinfo=started_at.tzinfo)

    submission.time_taken_seconds = int(
        (submitted_at - started_at).total_seconds()
    )

    db.flush()
    db.refresh(submission)
    score, percentage, status = evaluate_submission(submission, test)
    submission.score = score
    submission.percentage = percentage
    submission.status = status

    db.commit()

    message = "Submitted successfully."
    if status.value == "pending":
        message = "Submitted. Waiting for teacher grading for open-ended answers."
    if status.value == "fail" and submission.force_fail:
        message = "Test ended with FAIL due to anti-cheat violations."

    return StudentSubmitResponse(
        submission_id=submission.id,
        status=status,
        score=score,
        percentage=percentage,
        message=message,
    )
