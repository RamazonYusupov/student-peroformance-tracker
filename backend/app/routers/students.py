from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.dependencies import get_current_teacher
from app.models import Submission, SubmissionStatus, Test
from app.schemas import StudentProfile, StudentProfileRow

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("", response_model=list[str])
def list_students(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    names = db.scalars(
        select(Submission.student_name)
        .group_by(Submission.student_name)
        .order_by(func.lower(Submission.student_name))
    ).all()
    return names


@router.get("/{student_name}", response_model=StudentProfile)
def get_student_profile(
    student_name: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    submissions = db.scalars(
        select(Submission)
        .options(joinedload(Submission.test))
        .where(Submission.student_name == student_name)
        .order_by(Submission.submitted_at)
    ).all()

    if not submissions:
        raise HTTPException(status_code=404, detail="Student not found")

    completed = [s for s in submissions if s.submitted_at is not None]
    total_tests = len(completed)
    avg_score = round(sum(s.percentage for s in completed) /
                      total_tests, 2) if total_tests else 0
    pass_count = len(
        [s for s in completed if s.status == SubmissionStatus.PASS])
    pass_rate = round((pass_count / total_tests) *
                      100, 2) if total_tests else 0
    violations_total = sum(s.violations for s in completed)
    last_active = completed[-1].submitted_at if completed else None

    history = [
        StudentProfileRow(
            test_id=s.test_id,
            test_title=s.test.title,
            subject=s.test.subject,
            submitted_at=s.submitted_at,
            score=s.score,
            percentage=s.percentage,
            status=s.status,
            violations=s.violations,
            time_taken_seconds=s.time_taken_seconds,
        )
        for s in completed
    ]

    return StudentProfile(
        student_name=student_name,
        total_tests_taken=total_tests,
        average_score=avg_score,
        pass_rate=pass_rate,
        total_violations=violations_total,
        last_active=last_active,
        history=history,
    )
