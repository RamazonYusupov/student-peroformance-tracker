from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.dependencies import get_current_teacher
from app.models import Answer, Submission, Test
from app.schemas import AnalyticsOverview

router = APIRouter(prefix="/api/tests", tags=["analytics"])


@router.get("/{test_id}/analytics", response_model=AnalyticsOverview)
def get_test_analytics(
    test_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_teacher),
):
    test = db.scalar(
        select(Test)
        .options(joinedload(Test.questions), joinedload(Test.submissions).joinedload(Submission.answers))
        .where(Test.id == test_id)
    )
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    submissions = [s for s in test.submissions if s.submitted_at is not None]
    if not submissions:
        return AnalyticsOverview(
            average_score=0,
            average_percentage=0,
            highest_score=0,
            lowest_score=0,
            score_distribution={"0-20": 0, "21-40": 0,
                                "41-60": 0, "61-80": 0, "81-100": 0},
            question_difficulty=[],
            group_results_over_time=[],
        )

    scores = [s.score for s in submissions]
    percentages = [s.percentage for s in submissions]

    distribution = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    for p in percentages:
        if p <= 20:
            distribution["0-20"] += 1
        elif p <= 40:
            distribution["21-40"] += 1
        elif p <= 60:
            distribution["41-60"] += 1
        elif p <= 80:
            distribution["61-80"] += 1
        else:
            distribution["81-100"] += 1

    correct_counter = defaultdict(int)
    total_counter = defaultdict(int)

    for submission in submissions:
        for answer in submission.answers:
            total_counter[answer.question_id] += 1
            if answer.is_correct is True:
                correct_counter[answer.question_id] += 1

    question_difficulty = []
    for q in test.questions:
        total = total_counter.get(q.id, 0)
        correct = correct_counter.get(q.id, 0)
        pct = round((correct / total) * 100, 2) if total else 0
        question_difficulty.append(
            {
                "question_id": q.id,
                "prompt": q.prompt,
                "correct_percentage": pct,
                "is_most_missed": pct < 40,
            }
        )

    timeline_buckets: dict[str, list[float]] = defaultdict(list)
    for submission in submissions:
        if not submission.submitted_at:
            continue
        bucket = submission.submitted_at.date().isoformat()
        timeline_buckets[bucket].append(submission.percentage)

    group_results_over_time = [
        {
            "date": date,
            "average_percentage": round(sum(values) / len(values), 2),
            "submission_count": len(values),
        }
        for date, values in sorted(timeline_buckets.items(), key=lambda item: item[0])
    ]

    return AnalyticsOverview(
        average_score=round(sum(scores) / len(scores), 2),
        average_percentage=round(sum(percentages) / len(percentages), 2),
        highest_score=max(scores),
        lowest_score=min(scores),
        score_distribution=distribution,
        question_difficulty=question_difficulty,
        group_results_over_time=group_results_over_time,
    )
