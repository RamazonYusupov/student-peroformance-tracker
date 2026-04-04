from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_teacher
from app.models import Group
from app.schemas import GroupCreate, GroupRead, GroupStudent

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
