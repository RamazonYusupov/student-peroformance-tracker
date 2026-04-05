from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models import QuestionType, SubmissionStatus


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str
    password: str


class QuestionBase(BaseModel):
    question_type: QuestionType
    prompt: str
    options: list[str] | None = None
    correct_answer: str | None = None
    points: int = Field(default=1, ge=0)
    expected_length_hint: str | None = None
    min_word_count_hint: int | None = None
    order_index: int = 0


class QuestionCreate(QuestionBase):
    pass


class QuestionRead(QuestionBase):
    id: int

    class Config:
        from_attributes = True


class GroupStudent(BaseModel):
    full_name: str = Field(min_length=1)
    student_id: str = Field(min_length=1)


class GroupBase(BaseModel):
    name: str
    students: list[GroupStudent] = Field(default_factory=list)


class GroupCreate(GroupBase):
    pass


class GroupRead(GroupBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


class TestBase(BaseModel):
    title: str
    description: str | None = None
    subject: str | None = None
    group_id: str | None = None
    group_ids: list[str] = Field(default_factory=list)
    start_at: datetime
    end_at: datetime
    randomize_question_order: bool = False
    passing_score: int = Field(default=60, ge=0, le=100)


class TestCreate(TestBase):
    questions: list[QuestionCreate]


class TestUpdate(TestBase):
    questions: list[QuestionCreate]


class TestRead(TestBase):
    id: str
    created_at: datetime
    group: GroupRead | None = None
    questions: list[QuestionRead]

    class Config:
        from_attributes = True


class TestListItem(BaseModel):
    id: str
    title: str
    subject: str | None
    group_name: str | None
    group_names: list[str] = Field(default_factory=list)
    start_at: datetime
    end_at: datetime
    submission_count: int
    status: Literal["draft", "scheduled", "active", "expired"]


class DashboardSummary(BaseModel):
    total_tests: int
    active_tests: int
    total_submissions: int
    pending_grading: int
    recent_activity: list["SubmissionResultRow"]


class DashboardGroupTrendPoint(BaseModel):
    date: str
    average_percentage: float
    submission_count: int


class DashboardGroupTrendResponse(BaseModel):
    group_id: str | None = None
    group_name: str
    points: list[DashboardGroupTrendPoint]


class StudentStartRequest(BaseModel):
    full_name: str = Field(min_length=1)
    student_id: str = Field(min_length=1)


class StudentEntryResponse(BaseModel):
    test_id: str
    title: str
    description: str | None
    group_name: str | None = None
    group_names: list[str] = Field(default_factory=list)
    start_at: datetime
    end_at: datetime
    message: str
    is_access_allowed: bool


class StudentQuestionRead(BaseModel):
    id: int
    question_type: QuestionType
    prompt: str
    options: list[str] | None = None
    points: int


class StudentStartResponse(BaseModel):
    submission_id: str
    session_token: str
    test_id: str
    title: str
    end_at: datetime
    student_name: str
    questions: list[StudentQuestionRead]


class StudentAnswerPayload(BaseModel):
    question_id: int
    answer_text: str | None = None


class StudentSubmitRequest(BaseModel):
    session_token: str
    violations: int = 0
    forced_fail: bool = False
    penalized_question_ids: list[int] = Field(default_factory=list)
    answers: list[StudentAnswerPayload]


class StudentSubmitResponse(BaseModel):
    submission_id: str
    status: SubmissionStatus
    score: float
    percentage: float
    message: str


class SubmissionAnswerRead(BaseModel):
    question_id: int
    prompt: str
    question_type: QuestionType
    correct_answer: str | None
    student_answer: str | None
    is_correct: bool | None
    awarded_points: float | None
    max_points: int
    feedback: str | None


class SubmissionResultRow(BaseModel):
    submission_id: str
    student_name: str
    student_id: str | None
    score: float
    total_points: float
    percentage: float
    status: SubmissionStatus
    violations: int
    time_taken_seconds: int | None
    submitted_at: datetime | None


class SubmissionDetail(BaseModel):
    submission_id: str
    test_id: str
    student_name: str
    student_id: str | None
    score: float
    percentage: float
    status: SubmissionStatus
    violations: int
    answers: list[SubmissionAnswerRead]


class GradeAnswerPayload(BaseModel):
    question_id: int
    is_correct: bool | None = None
    awarded_points: float | None = Field(default=None, ge=0)
    feedback: str | None = None


class GradeSubmissionRequest(BaseModel):
    answers: list[GradeAnswerPayload]


class AnalyticsOverview(BaseModel):
    average_score: float
    average_percentage: float
    highest_score: float
    lowest_score: float
    score_distribution: dict[str, int]
    question_difficulty: list[dict]
    group_results_over_time: list[dict]


class StudentProfileRow(BaseModel):
    test_id: str
    test_title: str
    subject: str | None
    submitted_at: datetime | None
    score: float
    percentage: float
    status: SubmissionStatus
    violations: int
    time_taken_seconds: int | None


class GroupStudentProfile(BaseModel):
    group_id: str
    group_name: str
    full_name: str
    student_id: str
    total_tests_taken: int
    average_score: float
    pass_rate: float
    total_violations: int
    last_active: datetime | None
    subjects: list[str] = Field(default_factory=list)
    history: list[StudentProfileRow]


class StudentProfile(BaseModel):
    student_name: str
    total_tests_taken: int
    average_score: float
    pass_rate: float
    total_violations: int
    last_active: datetime | None
    history: list[StudentProfileRow]
