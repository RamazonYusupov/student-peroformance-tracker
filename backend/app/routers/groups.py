from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.dependencies import get_current_teacher
from app.models import Group, Submission, SubmissionStatus, Test
from app.schemas import GroupCreate, GroupRead, GroupStudent, GroupStudentProfile, StudentProfileRow

router = APIRouter(prefix="/api/groups", tags=["groups"])


def _normalize_text(value: str) -> str:
    return " ".join(value.strip().split())


def _normalize_students(students: list[GroupStudent]) -> list[dict[str, str]]:
    cleaned: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    seen_pairs: set[tuple[str, str]] = set()

    for student in students:
        full_name = _normalize_text(student.full_name)
        student_id = _normalize_text(student.student_id)
        if not full_name or not student_id:
            continue

        normalized_id = student_id.lower()
        normalized_pair = (full_name.lower(), normalized_id)

        if normalized_id in seen_ids or normalized_pair in seen_pairs:
            continue

        seen_ids.add(normalized_id)
        seen_pairs.add(normalized_pair)
        cleaned.append({"full_name": full_name, "student_id": student_id})

    return cleaned


def _normalize_lookup(value: str | None) -> str:
    return _normalize_text(value).lower()


def _group_student_entry(group: Group, student_id: str) -> dict[str, str] | None:
    normalized_student_id = _normalize_lookup(student_id)
    for entry in group.students or []:
        if isinstance(entry, dict):
            entry_id = _normalize_lookup(entry.get("student_id"))
            if entry_id and entry_id == normalized_student_id:
                full_name = _normalize_text(entry.get("full_name"))
                student_id_value = _normalize_text(entry.get("student_id"))
                return {"full_name": full_name, "student_id": student_id_value}
        elif isinstance(entry, str):
            value = _normalize_text(entry)
            if value and _normalize_lookup(value) == normalized_student_id:
                return {"full_name": value, "student_id": value}
    return None


@router.get("", response_model=list[GroupRead])
def list_groups(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    return db.scalars(select(Group).order_by(func.lower(Group.name))).all()


@router.post("", response_model=GroupRead)
def create_group(
    payload: GroupCreate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    normalized_name = " ".join(payload.name.strip().split())
    if not normalized_name:
        raise HTTPException(status_code=400, detail="Group name is required")

    duplicate = db.scalar(
        select(Group).where(func.lower(Group.name) == normalized_name.lower())
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Group already exists")

    students = _normalize_students(payload.students)
    if not students:
        raise HTTPException(
            status_code=400,
            detail="Please add at least one student with full name and student ID",
        )

    group = Group(name=normalized_name,
                  students=students)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.put("/{group_id}", response_model=GroupRead)
def update_group(
    group_id: str,
    payload: GroupCreate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    group = db.scalar(select(Group).where(Group.id == group_id))
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    normalized_name = " ".join(payload.name.strip().split())
    if not normalized_name:
        raise HTTPException(status_code=400, detail="Group name is required")

    duplicate = db.scalar(
        select(Group).where(
            func.lower(Group.name) == normalized_name.lower(),
            Group.id != group_id,
        )
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Group already exists")

    students = _normalize_students(payload.students)
    if not students:
        raise HTTPException(
            status_code=400,
            detail="Please add at least one student with full name and student ID",
        )

    group.name = normalized_name
    group.students = students
    db.commit()
    db.refresh(group)
    return group


@router.delete("/{group_id}")
def delete_group(
    group_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    group = db.scalar(select(Group).where(Group.id == group_id))
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    db.delete(group)
    db.commit()
    return {"message": "Group deleted"}


@router.get("/{group_id}/students/{student_id}/profile", response_model=GroupStudentProfile)
def get_group_student_profile(
    group_id: str,
    student_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    group = db.scalar(select(Group).where(Group.id == group_id))
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    entry = _group_student_entry(group, student_id)
    if not entry:
        raise HTTPException(
            status_code=404, detail="Student not found in this group")

    student_name = entry["full_name"]
    student_id_value = entry["student_id"]
    normalized_student_name = _normalize_lookup(student_name)
    normalized_student_id = _normalize_lookup(student_id_value)

    submissions = db.scalars(
        select(Submission)
        .options(joinedload(Submission.test))
        .where(Submission.submitted_at.is_not(None))
        .order_by(Submission.submitted_at.asc())
    ).all()

    history: list[StudentProfileRow] = []
    subject_names: set[str] = set()
    for submission in submissions:
        submission_student_id = _normalize_lookup(submission.student_id)
        submission_student_name = _normalize_lookup(submission.student_name)

        matches_student = False
        if submission_student_id:
            matches_student = submission_student_id == normalized_student_id
        else:
            matches_student = submission_student_name == normalized_student_name

        if not matches_student or not submission.test:
            continue

        subject_name = submission.test.subject or "Uncategorized"
        subject_names.add(subject_name)
        history.append(
            StudentProfileRow(
                test_id=submission.test_id,
                test_title=submission.test.title,
                subject=submission.test.subject,
                submitted_at=submission.submitted_at,
                score=submission.score,
                percentage=submission.percentage,
                status=submission.status,
                violations=submission.violations,
                time_taken_seconds=submission.time_taken_seconds,
            )
        )

    completed = history
    total_tests = len(completed)
    average_score = round(
        sum(row.percentage for row in completed) / total_tests, 2) if total_tests else 0
    pass_count = len(
        [row for row in completed if row.status == SubmissionStatus.PASS])
    pass_rate = round((pass_count / total_tests) *
                      100, 2) if total_tests else 0
    total_violations = sum(row.violations for row in completed)
    last_active = completed[-1].submitted_at if completed else None

    return GroupStudentProfile(
        group_id=group.id,
        group_name=group.name,
        full_name=student_name,
        student_id=student_id_value,
        total_tests_taken=total_tests,
        average_score=average_score,
        pass_rate=pass_rate,
        total_violations=total_violations,
        last_active=last_active,
        subjects=sorted(subject_names, key=str.lower),
        history=completed,
    )
