from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.db import Base, engine
from app.models import Group
from app.routers import analytics, auth, dashboard, groups, public, students, submissions, tests

app = FastAPI(title="Student Performance Tracker API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    inspector = inspect(engine)
    if "tests" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("tests")}
        if "group_id" not in columns:
            with engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE tests ADD COLUMN group_id VARCHAR(36)"))
        if "group_ids" not in columns:
            with engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE tests ADD COLUMN group_ids JSON"))
                connection.execute(
                    text("UPDATE tests SET group_ids = '[]' WHERE group_ids IS NULL"))

    if "groups" in inspector.get_table_names():
        group_columns = {column["name"]
                         for column in inspector.get_columns("groups")}
        with engine.begin() as connection:
            if "students" not in group_columns:
                connection.execute(
                    text("ALTER TABLE groups ADD COLUMN students JSON"))
                connection.execute(
                    text("UPDATE groups SET students = '[]' WHERE students IS NULL"))
            if "created_at" not in group_columns:
                connection.execute(
                    text("ALTER TABLE groups ADD COLUMN created_at DATETIME"))

    Base.metadata.create_all(bind=engine)

    # Normalize legacy groups where students were stored as plain strings.
    with Session(engine) as session:
        all_groups = session.query(Group).all()
        has_changes = False
        for group in all_groups:
            students = group.students or []
            normalized: list[dict[str, str]] = []
            changed = False

            for entry in students:
                if isinstance(entry, dict):
                    full_name = " ".join(
                        str(entry.get("full_name", "")).strip().split())
                    student_id = " ".join(
                        str(entry.get("student_id", "")).strip().split())
                    if not full_name and not student_id:
                        changed = True
                        continue
                    if not full_name:
                        full_name = student_id
                        changed = True
                    if not student_id:
                        student_id = full_name
                        changed = True
                    normalized.append(
                        {"full_name": full_name, "student_id": student_id})
                else:
                    value = " ".join(str(entry).strip().split())
                    if not value:
                        changed = True
                        continue
                    normalized.append(
                        {"full_name": value, "student_id": value})
                    changed = True

            if changed:
                group.students = normalized
                has_changes = True

        if has_changes:
            session.commit()


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(tests.router)
app.include_router(public.router)
app.include_router(submissions.router)
app.include_router(analytics.router)
app.include_router(students.router)
app.include_router(groups.router)
