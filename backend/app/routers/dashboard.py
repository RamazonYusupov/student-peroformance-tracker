from datetime import datetime, timezone
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_teacher
from app.models import Group, Answer, Question, Submission, SubmissionStatus, Test
from app.schemas import DashboardGroupTrendResponse, DashboardSummary, SubmissionResultRow

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.strip().lower().split())


def _group_member_sets(group: Group) -> tuple[set[str], set[str]]:
    names: set[str] = set()
    ids: set[str] = set()
    for entry in (group.students or []):
        if isinstance(entry, dict):
            name = _normalize_text(entry.get("full_name"))
            student_id = _normalize_text(entry.get("student_id"))
            if name:
                names.add(name)
            if student_id:
                ids.add(student_id)
        elif isinstance(entry, str):
            value = _normalize_text(entry)
            if value:
                names.add(value)
                ids.add(value)
    return names, ids


def _submission_matches_group(submission: Submission, names: set[str], ids: set[str]) -> bool:
    normalized_name = _normalize_text(submission.student_name)
    normalized_id = _normalize_text(submission.student_id)
    return normalized_name in names or (normalized_id and normalized_id in ids)


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    total_tests = db.scalar(select(func.count(Test.id))) or 0
    now = datetime.now(timezone.utc)

    active_tests = (
        db.scalar(
            select(func.count(Test.id)).where(
                Test.start_at <= now,
                Test.end_at >= now,
            )
        )
        or 0
    )

    total_submissions = db.scalar(select(func.count(Submission.id))) or 0

    pending_grading = (
        db.scalar(
            select(func.count(Submission.id)).where(
                Submission.status == SubmissionStatus.PENDING
            )
        )
        or 0
    )

    recent = db.scalars(
        select(Submission).order_by(Submission.submitted_at.desc())
    ).all()

    recent_rows = []
    for sub in recent:
        total_points = sum(q.points for q in sub.test.questions)
        recent_rows.append(
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

    return DashboardSummary(
        total_tests=total_tests,
        active_tests=active_tests,
        total_submissions=total_submissions,
        pending_grading=pending_grading,
        recent_activity=recent_rows,
    )


@router.get("/group-trends", response_model=DashboardGroupTrendResponse)
def dashboard_group_trends(
    group_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    submissions = db.scalars(
        select(Submission)
        .where(Submission.submitted_at.is_not(None))
        .order_by(Submission.submitted_at.asc())
    ).all()

    group_name = "All Groups"
    filtered_submissions = submissions

    if group_id:
        group = db.scalar(select(Group).where(Group.id == group_id))
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        group_name = group.name
        member_names, member_ids = _group_member_sets(group)
        filtered_submissions = [
            submission
            for submission in submissions
            if _submission_matches_group(submission, member_names, member_ids)
        ]

    timeline_buckets: dict[str, list[float]] = defaultdict(list)
    for submission in filtered_submissions:
        if not submission.submitted_at:
            continue
        bucket = submission.submitted_at.date().isoformat()
        timeline_buckets[bucket].append(submission.percentage)

    points = [
        {
            "date": date,
            "average_percentage": round(sum(values) / len(values), 2),
            "submission_count": len(values),
        }
        for date, values in sorted(timeline_buckets.items(), key=lambda item: item[0])
    ]

    return DashboardGroupTrendResponse(
        group_id=group_id,
        group_name=group_name,
        points=points,
    )
