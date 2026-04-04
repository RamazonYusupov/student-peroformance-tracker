from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.dependencies import get_current_teacher
from app.models import Answer, Question, QuestionType, Submission, Test
from app.schemas import (
    GradeSubmissionRequest,
    SubmissionAnswerRead,
    SubmissionDetail,
    SubmissionResultRow,
)
from app.services import evaluate_submission

router = APIRouter(prefix="/api", tags=["submissions"])


@router.get("/tests/{test_id}/results", response_model=list[SubmissionResultRow])
def list_test_results(
    test_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    test = db.scalar(
        select(Test).options(joinedload(Test.questions)).where(
            Test.id == test_id)
    )
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    rows = []
    total_points = float(sum(q.points for q in test.questions))
    submissions = db.scalars(
        select(Submission).where(Submission.test_id ==
                                 test_id).order_by(Submission.submitted_at)
    ).all()

    for sub in submissions:
        rows.append(
            SubmissionResultRow(
                submission_id=sub.id,
                student_name=sub.student_name,
                student_id=sub.student_id,
                score=sub.score,
                total_points=total_points,
                percentage=sub.percentage,
                status=sub.status,
                violations=sub.violations,
                time_taken_seconds=sub.time_taken_seconds,
                submitted_at=sub.submitted_at,
            )
        )

    return rows


@router.get("/submissions/{submission_id}", response_model=SubmissionDetail)
def get_submission_detail(
    submission_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    submission = db.scalar(
        select(Submission)
        .options(
            joinedload(Submission.test).joinedload(Test.questions),
            joinedload(Submission.answers),
        )
        .where(Submission.id == submission_id)
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    answer_by_question = {a.question_id: a for a in submission.answers}
    answer_rows = []
    for question in submission.test.questions:
        answer = answer_by_question.get(question.id)
        answer_rows.append(
            SubmissionAnswerRead(
                question_id=question.id,
                prompt=question.prompt,
                question_type=question.question_type,
                correct_answer=question.correct_answer,
                student_answer=answer.answer_text if answer else None,
                is_correct=answer.is_correct if answer else None,
                awarded_points=answer.awarded_points if answer else None,
                max_points=question.points,
                feedback=answer.feedback if answer else None,
            )
        )

    return SubmissionDetail(
        submission_id=submission.id,
        test_id=submission.test_id,
        student_name=submission.student_name,
        student_id=submission.student_id,
        score=submission.score,
        percentage=submission.percentage,
        status=submission.status,
        violations=submission.violations,
        answers=answer_rows,
    )


@router.post("/submissions/{submission_id}/grade", response_model=SubmissionDetail)
def grade_submission(
    submission_id: str,
    payload: GradeSubmissionRequest,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    submission = db.scalar(
        select(Submission)
        .options(
            joinedload(Submission.answers),
            joinedload(Submission.test).joinedload(Test.questions),
        )
        .where(Submission.id == submission_id)
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    answer_map = {a.question_id: a for a in submission.answers}
    question_map = {q.id: q for q in submission.test.questions}

    for graded_answer in payload.answers:
        question = question_map.get(graded_answer.question_id)
        if not question:
            raise HTTPException(
                status_code=400, detail=f"Question {graded_answer.question_id} not found in submission test")

        answer = answer_map.get(graded_answer.question_id)
        if not answer:
            answer = Answer(
                submission_id=submission.id,
                question_id=graded_answer.question_id,
            )
            db.add(answer)

        if question.question_type in (QuestionType.SHORT_ANSWER, QuestionType.PARAGRAPH):
            is_correct = graded_answer.is_correct
            if is_correct is None:
                if graded_answer.awarded_points is None:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Question {question.id} requires teacher review. "
                            "Provide is_correct=true/false for short answer and paragraph questions."
                        ),
                    )
                is_correct = graded_answer.awarded_points >= float(
                    question.points)

            answer.is_correct = is_correct
            answer.awarded_points = float(question.points if is_correct else 0)
        elif graded_answer.awarded_points is not None:
            answer.awarded_points = min(
                max(float(graded_answer.awarded_points), 0.0), float(question.points))
            answer.is_correct = answer.awarded_points >= float(question.points)

        answer.feedback = graded_answer.feedback

    db.flush()
    score, percentage, status = evaluate_submission(
        submission, submission.test)
    submission.score = score
    submission.percentage = percentage
    submission.status = status
    db.commit()

    return get_submission_detail(submission_id, db, _)
