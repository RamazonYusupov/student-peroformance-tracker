from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.dependencies import get_current_teacher
from app.models import Group, Question, Submission, Test
from app.schemas import TestCreate, TestListItem, TestRead, TestUpdate
from app.services import test_status

router = APIRouter(prefix="/api/tests", tags=["tests"])


def _normalize_group_ids(group_id: str | None, group_ids: list[str]) -> list[str]:
    merged = [*(group_ids or []),
              group_id] if group_id else list(group_ids or [])
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in merged:
        candidate = (raw or "").strip()
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        cleaned.append(candidate)
    return cleaned


def _get_group_name_map(db: Session, group_ids: list[str]) -> dict[str, str]:
    if not group_ids:
        return {}
    groups = db.scalars(select(Group).where(Group.id.in_(group_ids))).all()
    return {group.id: group.name for group in groups}


def _ensure_groups_exist(db: Session, group_ids: list[str]) -> None:
    if not group_ids:
        return
    existing = {
        group_id for group_id in db.scalars(select(Group.id).where(Group.id.in_(group_ids))).all()
    }
    missing = [group_id for group_id in group_ids if group_id not in existing]
    if missing:
        raise HTTPException(
            status_code=404, detail="One or more assigned groups were not found")


@router.get("", response_model=list[TestListItem])
def list_tests(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    tests = db.scalars(
        select(Test)
        .options(joinedload(Test.group))
        .order_by(Test.created_at.desc())
    ).all()
    output = []
    for test in tests:
        normalized_group_ids = _normalize_group_ids(
            test.group_id, test.group_ids or [])
        group_name_map = _get_group_name_map(db, normalized_group_ids)
        ordered_group_names = [group_name_map[group_id]
                               for group_id in normalized_group_ids if group_id in group_name_map]
        submission_count = db.scalar(
            select(func.count(Submission.id)).where(
                Submission.test_id == test.id)
        )
        output.append(
            TestListItem(
                id=test.id,
                title=test.title,
                subject=test.subject,
                group_name=ordered_group_names[0] if ordered_group_names else (
                    test.group.name if test.group else None),
                group_names=ordered_group_names,
                start_at=test.start_at,
                end_at=test.end_at,
                submission_count=submission_count or 0,
                status=test_status(test),
            )
        )
    return output


@router.get("/{test_id}", response_model=TestRead)
def get_test(
    test_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    test = db.scalar(
        select(Test)
        .options(joinedload(Test.questions), joinedload(Test.group))
        .where(Test.id == test_id)
    )
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    return test


@router.post("", response_model=TestRead)
def create_test(
    payload: TestCreate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    normalized_group_ids = _normalize_group_ids(
        payload.group_id, payload.group_ids)
    _ensure_groups_exist(db, normalized_group_ids)

    test = Test(
        title=payload.title,
        description=payload.description,
        subject=payload.subject,
        group_id=normalized_group_ids[0] if normalized_group_ids else None,
        group_ids=normalized_group_ids,
        start_at=payload.start_at,
        end_at=payload.end_at,
        randomize_question_order=payload.randomize_question_order,
        passing_score=payload.passing_score,
    )
    db.add(test)
    db.flush()

    for idx, question in enumerate(payload.questions):
        db.add(
            Question(
                test_id=test.id,
                question_type=question.question_type,
                prompt=question.prompt,
                options=question.options,
                correct_answer=question.correct_answer,
                points=question.points,
                expected_length_hint=question.expected_length_hint,
                min_word_count_hint=question.min_word_count_hint,
                order_index=question.order_index if question.order_index else idx,
            )
        )

    db.commit()
    db.refresh(test)
    test = db.scalar(
        select(Test)
        .options(joinedload(Test.questions), joinedload(Test.group))
        .where(Test.id == test.id)
    )
    return test


@router.put("/{test_id}", response_model=TestRead)
def update_test(
    test_id: str,
    payload: TestUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    test = db.scalar(select(Test).where(Test.id == test_id))
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    normalized_group_ids = _normalize_group_ids(
        payload.group_id, payload.group_ids)
    _ensure_groups_exist(db, normalized_group_ids)

    test.title = payload.title
    test.description = payload.description
    test.subject = payload.subject
    test.group_id = normalized_group_ids[0] if normalized_group_ids else None
    test.group_ids = normalized_group_ids
    test.start_at = payload.start_at
    test.end_at = payload.end_at
    test.randomize_question_order = payload.randomize_question_order
    test.passing_score = payload.passing_score

    db.query(Question).filter(Question.test_id == test_id).delete()

    for idx, question in enumerate(payload.questions):
        db.add(
            Question(
                test_id=test.id,
                question_type=question.question_type,
                prompt=question.prompt,
                options=question.options,
                correct_answer=question.correct_answer,
                points=question.points,
                expected_length_hint=question.expected_length_hint,
                min_word_count_hint=question.min_word_count_hint,
                order_index=question.order_index if question.order_index else idx,
            )
        )

    db.commit()
    test = db.scalar(
        select(Test)
        .options(joinedload(Test.questions), joinedload(Test.group))
        .where(Test.id == test_id)
    )
    return test


@router.delete("/{test_id}")
def delete_test(
    test_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    test = db.scalar(select(Test).where(Test.id == test_id))
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    db.delete(test)
    db.commit()
    return {"message": "Test deleted"}
